import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CloudStorage, parseCloudBundle, type CloudVersion } from './cloud-storage';
import { digestBytes, type Asset } from './scene';
import { hydrateManifest, readManifest } from './workspace';
import { sceneURLs, type SceneLink } from './scene-links';
import type { SavedScene } from './scene-repository';

/** No local catalog fallback: a revision must use its own immutable geometry. */
export async function openSceneLink(client: SupabaseClient, link: SceneLink, sharedGeometry: (version: CloudVersion) => Promise<Blob>) {
  const { data, error } = await client.rpc('get_workspace_scene', { p_id: link.id, p_revision: link.revision ?? null, p_share_token: link.token ?? null });
  if (error) throw new Error(error.message);
  const scene = data.scene as SavedScene;
  const manifest = readManifest(scene.document);
  const available: Asset[] = [];
  const versions = data.versions as CloudVersion[];
  const storage = new CloudStorage(client, scene.owner_id);
  const failures: string[] = [];
  for (const assetId of new Set(manifest.instances.map(item => item.assetId))) {
    const items = manifest.instances.filter(item => item.assetId === assetId);
    const ids = new Set(items.map(item => item.cloudVersionId));
    const version = versions.find(value => value.id === items[0].cloudVersionId && value.asset?.asset_key === assetId && value.state === 'ready');
    // A manifest has one asset record per ID; reject ambiguous version mappings.
    if (ids.size !== 1 || !version) { failures.push(items[0].name); continue; }
    try {
      const blob = link.token ? await sharedGeometry(version) : await storage.downloadFile(version, 'asset.json');
      const file = version.files.find(file => file.name === 'asset.json');
      if (!file || blob.size !== file.size || await digestBytes(await blob.arrayBuffer()) !== file.sha256) throw new Error('Geometry integrity check failed.');
      const asset = parseCloudBundle(await blob.text()).asset;
      if (asset.id !== assetId) throw new Error('Geometry source mismatch.');
      available.push(asset);
    } catch { failures.push(items[0].name); }
  }
  const workspace = hydrateManifest(manifest, available);
  const missing = [...new Set([...failures, ...workspace.items.filter(item => item.missing).map(item => item.name)])];
  return { scene: { ...scene, ...sceneURLs(scene.id, scene.revision, window.location.origin) }, workspace,
    notice: missing.length ? `Unavailable assets: ${missing.join(', ')}. Ask the owner to upload matching geometry and share the new revision.` : '' };
}

export function publicSceneClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Cloud scene links are not configured on this workbench.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(30000) }) } });
}
export async function downloadSharedGeometry(link: SceneLink, version: CloudVersion) {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scene-asset`, { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(30000),
    headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sceneId: link.id, revision: link.revision, token: link.token, versionId: version.id }) });
  if (!response.ok) throw new Error('Shared geometry unavailable.');
  return response.blob();
}
