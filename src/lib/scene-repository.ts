import type { SupabaseClient } from '@supabase/supabase-js';
import { CloudStorage, scrubCloudData } from './cloud-storage';
import { hydrateManifest, makeManifest, readManifest, type Workspace } from './workspace';
import type { Asset } from './scene';

export type SavedScene = { id: string; owner_id: string; name: string; revision: number; updated_at: string; document?: unknown };
export type AssetRow = { id: string; asset_key: string; name: string; source_kind: string; metadata: { dimensions: Asset['dimensions']; source: Asset['source'] } };
export class SceneRepository {
  constructor(readonly client: SupabaseClient, readonly owner: string, readonly storageEnabled: boolean) {}
  async list(): Promise<SavedScene[]> {
    const {data,error}=await this.client.from('scenes').select('id,owner_id,name,revision,updated_at').eq('owner_id',this.owner).order('updated_at',{ascending:false}).limit(200);
    if(error)throw new Error(error.message);return data;
  }
  async saveMetadata(assets: Asset[]) {
    if (assets.some(asset => asset.source.kind === 'generated')) throw new Error('Generated architecture is local-only. Export a portable scene JSON to preserve its geometry.');
    const rows=[...new Map(assets.map(asset=>[asset.id,{owner_id:this.owner,asset_key:asset.id,name:asset.name,source_kind:asset.source.kind,metadata:scrubCloudData({dimensions:asset.dimensions,source:asset.source})}])).values()];
    if(!rows.length)return;
    const {error}=await this.client.from('assets').upsert(rows,{onConflict:'owner_id,asset_key'});if(error)throw new Error(error.message);
  }
  async catalog(): Promise<AssetRow[]> {
    const {data,error}=await this.client.from('assets').select('id,asset_key,name,source_kind,metadata').eq('owner_id',this.owner).order('updated_at',{ascending:false}).limit(200);
    if(error)throw new Error(error.message);return data as AssetRow[];
  }
  async deleteMetadata(assetKey: string): Promise<void> {
    const { error } = await this.client.from('assets').delete().eq('owner_id', this.owner).eq('asset_key', assetKey);
    if (error) throw new Error(error.message);
  }
  async save(workspace: Workspace, name: string, id: string, revision: number, uploadGeometry: boolean, progress:(text:string)=>void): Promise<{scene:SavedScene;workspace:Workspace}> {
    const copy:Workspace={...workspace,items:workspace.items.map(item=>({...item})),animation:structuredClone(workspace.animation)};
    await this.saveMetadata(copy.items.map(item=>item.asset));
    const storage=new CloudStorage(this.client,this.owner);
    const versions=(uploadGeometry||copy.items.some(i=>i.cloudVersionId))?await storage.list():[];
    const mapped=new Map<string,string>();
    for(const item of copy.items){
      const existing=versions.find(v=>v.id===item.cloudVersionId&&v.state==='ready'&&v.asset?.asset_key===item.asset.id);
      if(existing)continue;
      item.cloudVersionId=undefined;
      if(uploadGeometry){
        if(!this.storageEnabled)throw new Error('Enable cloud storage before uploading geometry.');
        if(item.missing)throw new Error(`Reimport missing geometry for ${item.name} before uploading.`);
        let version=mapped.get(item.asset.id);
        if(!version){version=(await storage.upload({id:item.asset.id,asset:item.asset,updatedAt:Date.now()},progress)).id;mapped.set(item.asset.id,version);}
        item.cloudVersionId=version;
      }
    }
    const document=makeManifest(copy);readManifest(document);
    progress('Saving scene and asset references…');
    const {data,error}=await this.client.rpc('save_workspace_scene',{p_id:id,p_name:name.trim(),p_document:document,p_expected_revision:revision,p_write_id:crypto.randomUUID()});
    if(error)throw new Error(error.message);
    return{scene:(Array.isArray(data)?data[0]:data) as SavedScene,workspace:copy};
  }
  async open(id:string,localAssets:Asset[],progress:(text:string)=>void):Promise<{scene:SavedScene;workspace:Workspace}> {
    const {data,error}=await this.client.from('scenes').select('*').eq('id',id).eq('owner_id',this.owner).single();
    if(error)throw new Error('Scene unavailable. Refresh the list; it may have been deleted.');
    const manifest=readManifest(data.document);
    const available=new Map(localAssets.map(asset=>[asset.id,asset]));const notices:string[]=[];
    if(this.storageEnabled){
      const storage=new CloudStorage(this.client,this.owner);const versions=await storage.list();
      for(const item of manifest.instances){
        if(available.has(item.assetId)||!item.cloudVersionId)continue;
        const version=versions.find(v=>v.id===item.cloudVersionId&&v.state==='ready'&&v.asset?.asset_key===item.assetId);
        if(!version){notices.push(item.name);continue;}
        progress(`Loading ${item.name}…`);
        try{available.set(item.assetId,(await storage.load(version)).asset);}catch{notices.push(item.name);}
      }
    }
    const workspace=hydrateManifest(manifest,[...available.values()]);
    progress(notices.length?`Some geometry is unavailable: ${notices.join(', ')}. Reimport matching sources.`:'Scene loaded.');
    return{scene:data,workspace};
  }
  async remove(scene:SavedScene){const{error}=await this.client.rpc('delete_workspace_scene',{p_id:scene.id,p_expected_revision:scene.revision});if(error)throw new Error(error.message);}
  async duplicate(scene:SavedScene,name:string):Promise<SavedScene>{
    const {data,error}=await this.client.rpc('duplicate_workspace_scene',{p_source_id:scene.id,p_new_id:crypto.randomUUID(),p_name:name.trim()});
    if(error)throw new Error(error.message);return(Array.isArray(data)?data[0]:data) as SavedScene;
  }
}
