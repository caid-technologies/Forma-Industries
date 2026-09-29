import { useEffect,useRef,useState } from 'react';
import { cloudStorageEnabled,connectUserClient } from '../lib/cloud-session';
import { SceneRepository,type SavedScene,type AssetRow } from '../lib/scene-repository';
import { sceneURLs } from '../lib/scene-links';
import { SceneHistory } from './scene-history';
import { SceneConflictError } from '../lib/scene-history';
import { listLibrary } from '../lib/library';
import { canonicalJSON,emptyWorkspace,makeManifest,sceneContent,type Workspace } from '../lib/workspace';

export function SceneControls({workspace,owner,roomId,setRoomId,current,setCurrent,replace,busy,setBusy,onExport}: {
  workspace:Workspace;owner:string|null;roomId:string;setRoomId:(value:string)=>void;current:SavedScene|null;setCurrent:(value:SavedScene|null)=>void;
  replace:(workspace:Workspace)=>void;busy:boolean;setBusy:(busy:boolean)=>void;onExport:()=>void;
}) {
  const [shareURL,setShareURL]=useState('');
  const [name,setName]=useState(current?.name??'Untitled room');
  const [scenes,setScenes]=useState<SavedScene[]>([]);const[catalog,setCatalog]=useState<AssetRow[]>([]);
  const[message,setMessage]=useState('');const[error,setError]=useState('');
  const [retry,setRetry]=useState<{label:string;run:()=>void}|null>(null);
  const [pendingSwitch,setPendingSwitch]=useState<{label:string;action:()=>void}|null>(null);
  const[upload,setUpload]=useState(cloudStorageEnabled);
  const epoch=useRef(0);const operation=useRef(0);const active=useRef(true);
  useEffect(()=>{setName(current?.name??'Untitled room');setShareURL('');},[current?.id,current?.revision]);
  useEffect(()=>{active.current=true;return()=>{active.current=false;epoch.current++;};},[]);
  useEffect(()=>{
    const token=++epoch.current;setScenes([]);setCatalog([]);setError('');setMessage('');if(!owner)return;
    void connectUserClient(owner).then(async client=>{const repo=new SceneRepository(client,owner,cloudStorageEnabled);const rows=await repo.list();if(active.current&&token===epoch.current)setScenes(rows);}).catch(e=>{if(active.current&&token===epoch.current)setError(e.message);});
  },[owner]);
  const valid=(token:number)=>active.current&&token===epoch.current;
  async function run(work:(repo:SceneRepository,token:number)=>Promise<void>){
    if(!owner||busy)return;const token=++operation.current;const sessionEpoch=epoch.current;setBusy(true);setError('');setRetry(null);
    try{await work(new SceneRepository(await connectUserClient(owner),owner,cloudStorageEnabled),sessionEpoch);}
    catch(e){if(active.current&&sessionEpoch===epoch.current&&token===operation.current){const message=(e as Error).message;setError(message);if(!(e instanceof SceneConflictError))setRetry({label:'Retry last cloud action',run:()=>void run(work)});}}
    finally{if(active.current&&sessionEpoch===epoch.current&&token===operation.current)setBusy(false);}
  }
  function confirmSwitch(action:string){return !dirty||window.confirm(`This room has unsaved changes. ${action} and discard them?`);}
  function requestSwitch(label:string,action:()=>void){
    if(dirty){setPendingSwitch({label,action});return;}
    action();
  }
  async function saveBeforeSwitch(){
    const pending=pendingSwitch;if(!pending)return;
    const ok=await saveCurrent();
    if(ok){setPendingSwitch(null);pending.action();}
  }
  async function saveCurrent():Promise<boolean>{
    if(!owner||!name.trim()){setError('Sign in and name the room before saving.');return false;}
    let succeeded=false;
    await run(async(repo,token)=>{
      const result=await repo.save(workspace,name,current?.id??(/^[a-f0-9-]{36}$/i.test(roomId)?roomId:crypto.randomUUID()),current?.revision??0,upload&&cloudStorageEnabled,text=>{if(valid(token))setMessage(text);});
      if(!valid(token))return;
      replace(result.workspace);setCurrent(result.scene);setRoomId(result.scene.id);setMessage('Scene saved to Postgres.');setScenes(await repo.list());succeeded=true;
    });
    return succeeded;
  }
  function openScene(scene:SavedScene){
    if(!confirmSwitch('Open this room'))return;
    void run(async(repo,token)=>{const local=await listLibrary();const result=await repo.open(scene.id,[...workspace.items.filter(i=>!i.missing).map(i=>i.asset),...local.map(e=>e.asset)],text=>{if(valid(token))setMessage(text);});if(!valid(token))return;replace(result.workspace);setCurrent(result.scene);setRoomId(result.scene.id);setName(result.scene.name);setMessage(result.workspace.items.some(i=>i.missing)?'Scene opened with unavailable geometry. Retrieve exact pinned versions; unversioned assets can be reimported.':'Cloud scene opened.');});
  }
  function restoreRevision(revision:number,baseRevision:number){
    if(!current)return;
    const id=current.id;
    if(!window.confirm(`Restore revision ${revision} as a new head based on revision ${baseRevision}?${dirty?' This replaces your unsaved local edits. Export or save them first if you need to keep them.':''} Existing saved revisions will remain unchanged.`))return;
    const writeId=crypto.randomUUID();
    void run(async(repo,token)=>{
      const restored=await repo.restore(id,revision,baseRevision,writeId);
      const local=await listLibrary();
      const result=await repo.open(id,[...workspace.items.filter(item=>!item.missing).map(item=>item.asset),...local.map(entry=>entry.asset)],()=>{},restored.revision);
      const rows=await repo.list();
      if(!valid(token))return;
      replace(result.workspace);setCurrent(result.scene);setRoomId(id);setName(result.scene.name);setScenes(rows);
      setMessage(`Restored revision ${revision} as revision ${restored.revision}.${result.workspace.items.some(item=>item.missing)?' Some exact geometry is unavailable.':''}`);
    });
  }
  function duplicateScene(scene:SavedScene){void run(async(repo,token)=>{const duplicate=await repo.duplicate(scene,`${scene.name} copy`);const local=await listLibrary();const result=await repo.open(duplicate.id,[...workspace.items.filter(i=>!i.missing).map(i=>i.asset),...local.map(e=>e.asset)],()=>{});if(!valid(token))return;replace(result.workspace);setCurrent(result.scene);setRoomId(result.scene.id);setName(result.scene.name);setScenes(await repo.list());setMessage('Room duplicated.');});}
  function deleteScene(scene:SavedScene){if(!window.confirm(`Delete ${scene.name}? Shared geometry and other rooms remain.`))return;void run(async(repo,token)=>{await repo.remove(scene);const rows=await repo.list();if(valid(token)){setScenes(rows);if(current?.id===scene.id){setCurrent(null);setRoomId(crypto.randomUUID());replace(emptyWorkspace());setName('Untitled room');}setMessage('Room deleted; shared cloud files retained.');}});}
  function deleteMetadata(asset:AssetRow){if(!window.confirm(`Delete cloud metadata for ${asset.name}? Binary versions must be removed first.`))return;void run(async(repo,token)=>{await repo.deleteMetadata(asset.asset_key);if(!valid(token))return;setCatalog((rows)=>rows.filter(row=>row.asset_key!==asset.asset_key));setMessage('Asset metadata deleted.');});}
  const urls=current?sceneURLs(current.id,current.revision,window.location.origin):null;
  const dirty=current?!current.document||canonicalJSON(sceneContent(current.document))!==canonicalJSON(makeManifest(workspace))||current.name!==name.trim():workspace.items.length>0;
  return <section aria-label="Scene persistence">
    <div className="eyebrow">SCENES / POSTGRES</div>
    <p>{current?`Cloud revision ${current.revision} · ${dirty?'Unsaved changes':'Saved'}`:'Local workspace · not saved to cloud'}</p>
    <button disabled={busy} onClick={onExport}>Export scene JSON</button>
    {!owner?<p>Sign in to save scenes and library metadata across devices. You can export/import scene JSON locally.</p>:<>
      <label>Scene name<input aria-label="Scene name" value={name} disabled={busy} maxLength={200} onChange={e=>setName(e.target.value)}/></label>
      <label className="inline-check"><input aria-label="Include cloud geometry" type="checkbox" checked={upload&&cloudStorageEnabled} disabled={busy||!cloudStorageEnabled} onChange={e=>setUpload(e.target.checked)}/> Include cloud geometry</label>
      <p>{cloudStorageEnabled?'Saving with geometry uploads the referenced assets for use on other devices.':'Storage is disabled. Metadata-only scenes can still be saved; geometry must be reimported on other devices.'}</p>
      <div className="capture-actions"><button disabled={busy||!name.trim()} onClick={()=>void saveCurrent()}>Save cloud scene</button><button disabled={busy} onClick={()=>requestSwitch('Create a new room',()=>{replace(emptyWorkspace());setCurrent(null);setRoomId(crypto.randomUUID());setName('Untitled room');setMessage('New room ready.');})}>New room</button><button disabled={busy||!current} onClick={()=>requestSwitch('Create a copy',()=>{setCurrent(null);setRoomId(crypto.randomUUID());setName(`${name} copy`);setMessage('Copy ready to save as a new room.');})}>Save as new copy</button><button disabled={busy} onClick={()=>void run(async(repo,token)=>{const rows=await repo.list();if(valid(token))setScenes(rows);})}>Refresh scenes</button></div>
      {current&&urls&&<div aria-label="Scene links">
        <p>Private links require the owner's sign-in.</p>
        <p><a href={urls.head_url}>Open latest revision</a><br/><a href={urls.revision_url}>Open revision {current.revision}</a></p>
        <button disabled={busy} onClick={()=>void navigator.clipboard.writeText(urls.revision_url)
          .then(()=>setMessage('Private revision link copied.'))
          .catch(()=>setError('Copy failed. Copy the revision link address above.'))}>Copy private revision link</button>
        <p>Sharing lets anyone with the link view this saved revision and its geometry for 7 days. Edits must be saved before sharing.</p>
        <button disabled={busy||dirty} onClick={()=>void run(async(repo,token)=>{
          const share=await repo.share(current);
          if(valid(token)){setShareURL(share.url);setMessage(`Shared revision ${current.revision} until ${new Date(share.expires_at).toLocaleString()}.`);}
        })}>Create shared revision link</button>
        <button disabled={busy} onClick={()=>void run(async(repo,token)=>{
          await repo.revokeShares(current.id);
          if(valid(token)){setShareURL('');setMessage('All shared links for this scene revoked.');}
        })}>Revoke all shared links</button>
        {shareURL&&<>
          <label>Shared revision URL<input aria-label="Shared revision URL" readOnly value={shareURL}/></label>
          <button onClick={()=>void navigator.clipboard.writeText(shareURL)
            .then(()=>setMessage('Shared revision link copied.'))
            .catch(()=>setError('Copy failed. Select and copy the shared URL.'))}>Copy shared link</button>
        </>}
      </div>}
      {current?.owner_id===owner&&<SceneHistory key={`${owner}:${current.id}:${current.revision}`} scene={current} owner={owner} busy={busy} restore={restoreRevision}/>}
      {scenes.map(scene=><div className={`saved-scene ${current?.id===scene.id?'active-scene':''}`} key={scene.id}><span><b>{scene.name}</b><br/><small>Revision {scene.revision} · {new Date(scene.updated_at).toLocaleString()}</small></span><div className="capture-actions"><button disabled={busy} aria-label={`Open scene ${scene.name}`} onClick={()=>requestSwitch(`Open ${scene.name}`,()=>openScene(scene))}>Open</button><button disabled={busy} aria-label={`Duplicate scene ${scene.name}`} onClick={()=>requestSwitch(`Create a copy of ${scene.name}`,()=>duplicateScene(scene))}>Duplicate</button><button disabled={busy} aria-label={`Delete scene ${scene.name}`} onClick={()=>deleteScene(scene)}>Delete</button></div></div>)}
      <details><summary>Cloud library metadata</summary><p>Explicitly sync the device library catalog through Postgres. This does not upload binary geometry or GIFs.</p><div className="capture-actions"><button disabled={busy} onClick={()=>void run(async(repo,token)=>{const local=await listLibrary();await repo.saveMetadata(local.map(e=>e.asset));const rows=await repo.catalog();if(valid(token)){setCatalog(rows);setMessage('Library metadata synced.');}})}>Sync library metadata</button><button disabled={busy} onClick={()=>void run(async(repo,token)=>{const rows=await repo.catalog();if(valid(token))setCatalog(rows);})}>Refresh asset metadata</button></div>{catalog.map(asset=><div className="metadata-row" key={asset.id}><p><b>{asset.name}</b><br />{asset.source_kind} · {asset.metadata.dimensions?.join(' × ')} m<br /><small>Use Cloud files to retrieve geometry, or reimport the matching source.</small></p><button disabled={busy} onClick={()=>deleteMetadata(asset)}>Delete metadata</button></div>)}</details>
    </>}
    {pendingSwitch&&<div className="switch-confirm" role="dialog" aria-label="Unsaved room changes"><b>Unsaved changes</b><p>{pendingSwitch.label}?</p><div className="capture-actions"><button disabled={busy} onClick={()=>void saveBeforeSwitch()}>Save and continue</button><button disabled={busy} onClick={()=>{const action=pendingSwitch.action;setPendingSwitch(null);action();}}>Discard and continue</button><button disabled={busy} onClick={()=>setPendingSwitch(null)}>Cancel</button></div></div>}
    {retry&&<button disabled={busy} onClick={retry.run}>{retry.label}</button>}
    <p role="status" aria-label="Scene save status">{busy?'Working… ':''}{message}</p>
    {error&&<p role="alert" className="capture-error">{error}</p>}
  </section>;
}
