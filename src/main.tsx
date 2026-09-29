import { useEffect,useRef,useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal,flushSync } from 'react-dom';
import { ImportService } from './lib/imports';
import type { Asset,Vec3 } from './lib/scene';
import { appendAssets,emptyWorkspace,hydrateManifest,makeManifest,readManifest,type Workspace } from './lib/workspace';
import { preserveAuthWorkspace,restoreAuthWorkspace } from './lib/auth-workspace';
import { useUserId } from './lib/use-user';
import type { SavedScene } from './lib/scene-repository';
import type { FloorRegion } from './lib/gif';
import type { GifMetadata } from './lib/gif';
import { makeAnimationFeedback } from './lib/animation-feedback';
import { readSamplingPlan, type SamplingRoomPlan } from './lib/cleanroom';
import { SPACE_BRIEFS, buildSpace, inferSpaceBrief, type SpaceBriefKey } from './lib/space-builder';
import { CaptureTools } from './components/capture-tools';
import { AuthControls } from './components/auth-controls';
import { WorkspaceViewer } from './components/workspace-viewer';
import { Timeline } from './components/timeline';
import { SceneControls } from './components/scene-controls';
import { ProjectInspector } from './components/project-inspector';
import { backupDraft, loadWorkspaceDraft, replaceDraftWithBackup, saveWorkspaceDraft } from './lib/workspace-draft';
import { supabase } from './lib/supabase';
import './style.css';
import './workspace.css';

const importer=new ImportService();
type History={past:Workspace[];present:Workspace;future:Workspace[]};
function App(){
  const [history,setHistory]=useState<History>(()=>({past:[],present:emptyWorkspace(),future:[]}));
  const workspace=history.present;const assets=workspace.items.map(i=>i.asset);
  const [selected,setSelected]=useState(-1);const[selectedPart,setSelectedPart]=useState(-1);const[focus,setFocus]=useState(0);
  const [time,setTime]=useState<number|null>(null);const[playing,setPlaying]=useState(false);
  const [currentScene,setCurrentScene]=useState<SavedScene|null>(null);
  const [roomId,setRoomId]=useState('local');
  const [status,setStatus]=useState('Ready to import');const[error,setError]=useState('');const[busy,setBusy]=useState(true);
  const [prompt,setPrompt]=useState('A small 5V laboratory temperature monitor with a display');const[mode,setMode]=useState('simulation');
  const [model,setModel]=useState('');const[provider,setProvider]=useState('openai');
  const [spaceKey,setSpaceKey]=useState<SpaceBriefKey>('maker');const[spaceRequirements,setSpaceRequirements]=useState(SPACE_BRIEFS.maker.description);
  const [upAxis,setUpAxis]=useState<'Z'|'Y'>('Z');const[scale,setScale]=useState(1);
  const stage=useRef<HTMLDivElement>(null);const input=useRef<HTMLInputElement>(null);
  const [fullscreen,setFullscreen]=useState(false);const[expanded,setExpanded]=useState(false);const[workspaceVisible,setWorkspaceVisible]=useState(false);
  const [captureOpen,setCaptureOpen]=useState(false);const[captureRegion,setCaptureRegion]=useState<FloorRegion|null>(null);
  const isFullscreen=fullscreen||expanded;const restoreAfterPicker=useRef(false);
  const cleanroomPreview=new URLSearchParams(location.search).get('scene')==='cleanroom';
  const owner=useUserId();const previousOwner=useRef<string|null>(null);
  const roomOperation=useRef(0);
  const[draftReady,setDraftReady]=useState(false);const draftOwner=useRef<string|null>(null);const draftEpoch=useRef(0);const[localSaved,setLocalSaved]=useState(false);
  const [adoptionPending,setAdoptionPending]=useState(false);
  const [draftRecovery,setDraftRecovery]=useState<{scope:string;message:string}|null>(null);
  const [samplingPlan,setSamplingPlan]=useState<SamplingRoomPlan[]>([]);
  function change(next:Workspace){setHistory(old=>({past:[...old.past,old.present].slice(-50),present:next,future:[]}));}
  function replace(next:Workspace){roomOperation.current++;setPlaying(false);setTime(null);setSelected(-1);setSelectedPart(-1);setHistory({past:[],present:next,future:[]});setFocus(n=>n+1);}
  useEffect(()=>{
    if(previousOwner.current&&previousOwner.current!==owner){draftEpoch.current++;draftOwner.current=owner;setAdoptionPending(false);replace(emptyWorkspace());setCurrentScene(null);setCaptureOpen(false);setStatus('Account changed; cloud workspace cleared.');}
    if(!previousOwner.current&&owner&&draftOwner.current!==owner&&workspace.items.length){setAdoptionPending(true);setBusy(true);setStatus('Choose what to do with this anonymous draft.');}
    previousOwner.current=owner;
  },[owner,workspace.items.length]);
  useEffect(()=>{
    let active=true;const epoch=draftEpoch.current;let requestedScope='guest';
    const fallback=window.setTimeout(()=>{if(active){setDraftReady(true);setBusy(false);setDraftRecovery({scope:requestedScope,message:'Saved workspace loading exceeded 12 seconds. Retry or recover it without discarding the stored data.'});setError('Saved workspace loading timed out.');}},12000);
    void (async()=>{
      const session=supabase?await supabase.auth.getSession():null;const id=session?.data.session?.user.id??null;
      requestedScope=id??'guest';
      let snapshot:Awaited<ReturnType<typeof restoreAuthWorkspace>>=null;
      let draft:Awaited<ReturnType<typeof loadWorkspaceDraft>>=null;
      let restored:Workspace|undefined;
      if(cleanroomPreview){
        const [sceneResponse,planResponse]=await Promise.all([fetch('/examples/cleanroom/cleanroom-suite.json'),fetch('/examples/cleanroom/sampling-plan.json')]);
        if(!sceneResponse.ok||!planResponse.ok)throw new Error('The bundled cleanroom example could not be loaded.');
        const [scene,plan]=await Promise.all([sceneResponse.json(),planResponse.json()]);
        restored=hydrateManifest(readManifest(scene),[]);setSamplingPlan(readSamplingPlan(plan));
      }else{
        snapshot=await restoreAuthWorkspace();restored=snapshot?.workspace;
        if(snapshot&&!restored){restored=appendAssets(emptyWorkspace(),snapshot.assets);restored.room=snapshot.room as Vec3;restored.items=restored.items.map((item,i)=>({...item,position:snapshot?.positions?.[i]??item.position}));}
        draft=restored?null:await loadWorkspaceDraft(id);restored??=draft?.workspace;
        if(!restored){const response=await fetch('/default-room.json');if(response.ok)restored=hydrateManifest(readManifest(await response.json()),[]);}
      }
      if(!active||epoch!==draftEpoch.current)return;draftOwner.current=id;
      if(restored){replace(restored);setCurrentScene(cleanroomPreview?null:draft?.scene??null);setRoomId(draft?.roomId??(cleanroomPreview?'cleanroom-suite-doubled':'default-machine-room'));setSelected(cleanroomPreview?-1:snapshot?.selected??(restored.items.length?0:-1));if(cleanroomPreview){setTime(0);setPlaying(true);}setStatus(cleanroomPreview?'Playing cleanroom sampling route':snapshot?'Restored workspace after sign-in':draft?'Restored local draft':'Loaded default machine interface room');}
    })().catch(e=>{if(active){draftOwner.current=requestedScope==='guest'?null:requestedScope;setDraftRecovery({scope:requestedScope,message:e instanceof Error?e.message:'The saved workspace could not be opened.'});setError('Your saved local workspace is invalid. Recover it below or start a clean workspace.');}}).finally(()=>{clearTimeout(fallback);if(active){setDraftReady(true);setBusy(false);}});
    return()=>{active=false;clearTimeout(fallback);};
  },[]);
  useEffect(()=>{
    if(!draftReady||draftOwner.current!==owner||new URLSearchParams(location.search).get('scene')==='cleanroom')return;setLocalSaved(false);
    const timer=setTimeout(()=>{void saveWorkspaceDraft(workspace,owner,roomId,currentScene).then(()=>setLocalSaved(true)).catch(e=>setError(e.message));},250);
    return()=>clearTimeout(timer);
  },[workspace,owner,roomId,draftReady,currentScene]);
  useEffect(()=>{
    if(!playing)return;let frame=0,last=performance.now();
    const tick=(now:number)=>{const dt=Math.min((now-last)/1000,.1);last=now;setTime(t=>{const next=(t??0)+dt;if(next>=workspace.animation.duration){if(workspace.animation.loop)return next%workspace.animation.duration;setPlaying(false);return workspace.animation.duration;}return next;});frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[playing,workspace.animation.duration,workspace.animation.loop]);
  useEffect(()=>{
    const sync=()=>setFullscreen(document.fullscreenElement===stage.current);
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false);};
    document.addEventListener('fullscreenchange',sync);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('fullscreenchange',sync);document.removeEventListener('keydown',escape);};
  },[]);
  useEffect(()=>{if(!expanded)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[expanded]);
  async function toggleFullscreen(){
    if(isFullscreen){restoreAfterPicker.current=false;if(document.fullscreenElement===stage.current)await document.exitFullscreen();setExpanded(false);return;}
    try{if(!stage.current?.requestFullscreen)throw new Error();await stage.current.requestFullscreen();}catch{setExpanded(true);}
  }
  function openFilePicker(){restoreAfterPicker.current=document.fullscreenElement===stage.current;if(isFullscreen)flushSync(()=>setExpanded(true));input.current?.click();}
  function finishFilePicker(){const restore=restoreAfterPicker.current;restoreAfterPicker.current=false;if(!restore)return;if(document.fullscreenElement===stage.current){setExpanded(false);return;}void stage.current?.requestFullscreen?.().then(()=>setExpanded(false)).catch(()=>{});}
  useEffect(()=>{const el=input.current;el?.addEventListener('cancel',finishFilePicker);return()=>el?.removeEventListener('cancel',finishFilePicker);});
  function addAsset(asset:Asset,cloudVersionId?:string){
    setHistory(old=>({past:[...old.past,old.present].slice(-50),present:appendAssets(old.present,[asset],cloudVersionId),future:[]}));
    setSelected(workspace.items.length);setSelectedPart(-1);setTime(null);setPlaying(false);setStatus(`Added ${asset.name} from library`);
  }
  function adoptAnonymousDraft(){
    if(!owner)return;
    draftOwner.current=owner;setRoomId(crypto.randomUUID());setCurrentScene(null);setAdoptionPending(false);setBusy(false);setStatus('Anonymous draft adopted. Save it to your account when ready.');
  }
  function discardAnonymousDraft(){
    if(!owner)return;
    draftOwner.current=owner;replace(emptyWorkspace());setRoomId(crypto.randomUUID());setCurrentScene(null);setAdoptionPending(false);setBusy(false);setStatus('Anonymous draft retained locally; a clean account workspace is active.');
  }
  async function load(files:File[]){
    if(busy||!files.length)return;setBusy(true);setError('');
    const operation=roomOperation.current;
    try{
      if(files.length===1&&files[0].name.toLowerCase().endsWith('.json')){
        if(files[0].size>75*1024*1024)throw new Error('Scene file exceeds 75 MiB.');
        let json;try{json=JSON.parse(await files[0].text());}catch{/* Forma importer supplies its normal invalid-JSON diagnostic. */}
        if(json?.format==='astra.scene'){replace(hydrateManifest(readManifest(json),assets));setCurrentScene(null);setStatus('Scene JSON opened.');return;}
      }
      const next=await importer.files(files,{upAxis,scale},setStatus);
      if(operation!==roomOperation.current){setStatus('Import ignored because the room changed.');return;}
      setHistory(old=>({past:[...old.past,old.present].slice(-50),present:appendAssets(old.present,next),future:[]}));
      setSelected(workspace.items.findIndex(i=>i.missing&&next.some(a=>a.id===i.asset.id))>=0?workspace.items.findIndex(i=>i.missing&&next.some(a=>a.id===i.asset.id)):workspace.items.length);
      setSelectedPart(-1);setTime(null);setPlaying(false);setStatus(`Imported ${next.length} asset(s)`);
    }catch(e){setError((e as Error).message);setStatus('Import failed');}finally{setBusy(false);}
  }
  async function generate(){
    setBusy(true);setError('');setStatus('Starting Forma…');
    const operation=roomOperation.current;
    try{
      const response=await fetch('/api/generations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,mode,provider,model})});const data=await response.json();if(!response.ok)throw new Error(data.error);
      for(;;){await new Promise(r=>setTimeout(r,1500));const response=await fetch(`/api/generations/${data.id}`);const job=await response.json();if(!response.ok||job.status==='failed')throw new Error(job.error??job.message);setStatus(job.message);if(job.status==='succeeded'){const next=await importer.files([new File([JSON.stringify(job.project)],'forma-generated.json')],{upAxis:'Z',scale:1},setStatus);if(operation!==roomOperation.current){setStatus('Forma result ignored because the room changed.');break;}setHistory(old=>({past:[...old.past,old.present].slice(-50),present:appendAssets(old.present,next),future:[]}));setSelected(workspace.items.length);setSelectedPart(-1);setStatus(`Forma ${mode} project imported`);break;}}
    }catch(e){setError((e as Error).message);setStatus('Generation failed');}finally{setBusy(false);}
  }
  async function sendAnimationFeedback(review: GifMetadata, instruction: string) {
    const feedback = makeAnimationFeedback(workspace, review, instruction);
    const response = await fetch('/api/forma/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(feedback) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Could not send animation feedback.');
    setStatus(data.message ?? 'Animation feedback saved for Forma.');
  }
  function buildDemoSpace() {
    if (workspace.items.length && !window.confirm('Replace the current room with a generated demo space? Export or save the current room first if you want to keep it.')) return;
    const key = inferSpaceBrief(spaceRequirements) || spaceKey;
    const result = buildSpace(key, spaceRequirements);
    replace(result.workspace); setCurrentScene(null); setSelected(result.movingIndex); setSelectedPart(-1);
    setStatus(`Built ${result.brief.label} layout with ${result.workspace.items.length} Forma equipment envelopes. Replace envelopes with Forma-authored equipment when ready.`);
  }
  function exportScene(){
    const blob=new Blob([JSON.stringify(makeManifest(workspace,true))],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='astra-scene.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function exportCorruptDraft(){
    if(!draftRecovery)return;
    try{const backup=await backupDraft(draftRecovery.scope);const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='astra-draft-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('Recovery backup downloaded.');}
    catch(e){setError((e as Error).message);}
  }
  async function resetCorruptDraft(){
    if(!draftRecovery)return;
    setBusy(true);
    try{const clean=emptyWorkspace();const newRoom=crypto.randomUUID();await replaceDraftWithBackup(clean,draftOwner.current,draftRecovery.scope,newRoom,null);setDraftRecovery(null);setError('');replace(clean);setRoomId(newRoom);setStatus('A clean workspace was created. The corrupt draft was backed up locally.');}
    catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  const side=<aside id="workspace-panel" className={isFullscreen?'fullscreen-workspace':''} hidden={isFullscreen&&!workspaceVisible}>
    <div className="eyebrow">WORKSPACE</div><h1>Make room<br/>for your ideas.</h1><p>Import a Forma project, STEP model, or saved Astra scene. Arrange it, author motion, and save it across devices.</p>
    <small role="status" aria-label="Local draft status">{localSaved?'Local draft saved':'Local draft changes pending'}</small>
    <div className="capture-actions"><button onClick={()=>document.querySelector('.timeline')?.scrollIntoView({block:'start'})}>Animate</button><button onClick={()=>document.querySelector('[aria-label="Scene persistence"]')?.scrollIntoView({block:'start'})}>Save / open scenes</button></div>
     {cleanroomPreview&&<section className="cleanroom-plan" aria-label="Today's cleanroom sampling plan"><div className="eyebrow">TODAY'S SAMPLING / POC</div><table aria-label="Room access and sample schedule"><thead><tr><th scope="col">Room</th><th scope="col">Samples</th><th scope="col">Proposed times</th><th scope="col">Access status</th></tr></thead><tbody>{samplingPlan.map(room=><tr key={room.room} className={room.access.status==='blocked'?'blocked-room':''}><th scope="row">{room.room}</th><td>{room.requiredSamples}</td><td>{room.proposedTimes.length?room.proposedTimes.map((time,index)=><span key={`${time.start}-${time.end}`}>{index>0&&<br/>}{time.start}–{time.end}</span>):'Not scheduled'}</td><td>{room.access.status==='available'?`Available ${room.access.window.start}–${room.access.window.end}`:`No access window; ${room.access.reason}`}</td></tr>)}</tbody></table><p>Facility map: A northwest, B northeast, C southwest; D is unplanned. The bot enters A and C only, and skips occupied Room B. Animation scale: 1 second = 1 scheduled minute from 09:00. POC only; confirm current access and sample points before operation.</p></section>}
    <input ref={input} aria-label="Import files" type="file" accept=".json,.step,.stp" multiple hidden onChange={e=>{finishFilePicker();void load(Array.from(e.target.files??[]));e.target.value='';}}/>
     <button className="import" disabled={busy} onClick={openFilePicker}>↑ Drop files or browse<br/><small>FORMA JSON · STEP · ASTRA SCENE</small></button>
     {!cleanroomPreview&&<section aria-label="Space brief"><div className="eyebrow">SPACE BRIEF / LOCAL DEMO</div><p>Describe the space. Astra organizes zones and workflow; Forma OSS authors the actual equipment.</p><label>Space type<select aria-label="Space type" value={spaceKey} disabled={busy} onChange={e=>{const key=e.target.value as SpaceBriefKey;setSpaceKey(key);setSpaceRequirements(SPACE_BRIEFS[key].description);}}>{Object.values(SPACE_BRIEFS).map(brief=><option key={brief.key} value={brief.key}>{brief.label}</option>)}</select></label><label>Requirements<textarea aria-label="Space requirements" value={spaceRequirements} maxLength={2000} disabled={busy} onChange={e=>setSpaceRequirements(e.target.value)} /></label><button className="capture-primary" disabled={busy||!spaceRequirements.trim()} onClick={buildDemoSpace}>Build space layout</button><small>Demo output uses clearly marked planning envelopes and includes a simple material-flow animation.</small></section>}
     <details><summary>STEP import settings</summary><label>Source up axis<select value={upAxis} onChange={e=>setUpAxis(e.target.value as 'Z'|'Y')}><option>Z</option><option>Y</option></select></label><label>Scale correction<input type="number" min=".000001" value={scale} onChange={e=>setScale(Number(e.target.value))}/></label></details>
     <section><div className="eyebrow">ROOM / METERS</div><div className="dimensions">{['Width','Depth','Height'].map((name,i)=><label key={name}>{name}<input aria-label={name} type="number" min="1" max="100" step=".5" disabled={busy} value={workspace.room[i]} onChange={e=>{const n=Number(e.target.value);if(n>=1&&n<=100)change({...workspace,room:workspace.room.map((v,j)=>j===i?n:v) as Vec3});}}/></label>)}</div><div className="capture-actions"><button onClick={()=>{setSelected(-1);setSelectedPart(-1);setFocus(n=>n+1);}}>View entire room</button><button disabled={busy} onClick={()=>{replace(emptyWorkspace());setCurrentScene(null);}}>New room</button></div></section>
    <section><div className="eyebrow">SCENE COLLECTION <span>{workspace.items.length}</span></div>{workspace.items.map((item,i)=><button className={`asset ${selected===i?'active':''}`} key={item.id} onClick={()=>{setSelected(i);setSelectedPart(-1);setFocus(n=>n+1);}}><span>◇ {item.name}{item.missing?' · MISSING GEOMETRY':''}</span><small>{item.asset.source.kind.toUpperCase()} · {item.asset.parts.length} components</small></button>)}</section>
    <div className="capture-actions"><button disabled={busy||!history.past.length} onClick={()=>{setPlaying(false);setTime(null);setHistory(old=>({past:old.past.slice(0,-1),present:old.past.at(-1)!,future:[old.present,...old.future]}));}}>Undo</button><button disabled={busy||!history.future.length} onClick={()=>{setPlaying(false);setTime(null);setHistory(old=>({past:[...old.past,old.present],present:old.future[0],future:old.future.slice(1)}));}}>Redo</button></div>
    {workspace.items.length>0&&<section><div className="eyebrow">LAYOUT / BASE TRANSFORMS</div>{workspace.items.map((item,i)=><fieldset className="placement" key={item.id}><legend>{item.name}</legend><label>Instance name<input aria-label={`${item.name} instance name`} maxLength={200} disabled={busy} value={item.name} onChange={e=>change({...workspace,items:workspace.items.map((v,j)=>i===j?{...v,name:e.target.value}:v)})}/></label>{(['position','rotation'] as const).map(kind=><div className="dimensions" key={kind}>{['X','Y','Z'].map((axis,index)=><label key={axis}>{axis}{kind==='rotation'?'°':''}<input aria-label={`${item.name} ${axis} ${kind}`} type="number" step={kind==='position'?'.1':'5'} disabled={busy} value={item[kind][index]} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)){setPlaying(false);setTime(null);change({...workspace,items:workspace.items.map((v,j)=>i===j?{...v,[kind]:v[kind].map((value,k)=>index===k?n:value) as Vec3}:v)});}}}/></label>)}</div>)}<label className="inline-check"><input type="checkbox" checked={item.visible} disabled={busy} onChange={e=>change({...workspace,items:workspace.items.map((v,j)=>i===j?{...v,visible:e.target.checked}:v)})}/> Visible</label><div className="capture-actions"><button disabled={busy} onClick={()=>change({...workspace,items:workspace.items.map((v,j)=>i===j?{...v,position:[0,0,0],rotation:[0,0,0]}:v)})}>Reset position</button><button disabled={busy} onClick={()=>change({...workspace,items:[...workspace.items,{...item,id:crypto.randomUUID(),name:`${item.name} copy`,position:[item.position[0]+item.asset.dimensions[0]+.25,item.position[1],item.position[2]]}]})}>Duplicate</button><button disabled={busy} onClick={()=>{change({...workspace,items:workspace.items.filter(v=>v.id!==item.id),animation:{...workspace.animation,tracks:workspace.animation.tracks.filter(t=>t.instanceId!==item.id)}});setSelected(-1);setSelectedPart(-1);}}>Delete instance</button></div></fieldset>)}</section>}
    <Timeline workspace={workspace} selected={selected} selectedPart={selectedPart} setPart={setSelectedPart} change={change} time={time} setTime={setTime} playing={playing} setPlaying={setPlaying} disabled={busy}/>
    <SceneControls workspace={workspace} owner={owner} roomId={roomId} setRoomId={setRoomId} current={currentScene} setCurrent={setCurrentScene} replace={replace} busy={busy} setBusy={setBusy} onExport={exportScene}/>
     {import.meta.env.VITE_FORMA_GENERATION_ENABLED!=='false'&&!cleanroomPreview&&<details><summary>Build with Forma</summary><textarea aria-label="Project description" value={prompt} onChange={e=>setPrompt(e.target.value)}/><label>Generation mode<select value={mode} onChange={e=>setMode(e.target.value)}><option value="simulation">Deterministic demo</option><option value="live">Live generation</option></select></label>{mode==='live'&&<><label>Provider<input value={provider} onChange={e=>setProvider(e.target.value)}/></label><label>Model<input value={model} onChange={e=>setModel(e.target.value)}/></label></>}<button disabled={busy} onClick={()=>void generate()}>Build and import →</button></details>}
  </aside>;
  return <><header className="app-header"><div className="brand"><span className="logo">A</span> ASTRA <span className="muted">INDUSTRIES</span></div><span className="tag">SPATIAL WORKBENCH</span><AuthControls beforeSignIn={()=>preserveAuthWorkspace(assets,workspace.room,selected,workspace.items.map(i=>i.position),workspace)}/><button disabled={busy} onClick={openFilePicker}>+ Import project</button></header>
    <main onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void load(Array.from(e.dataTransfer.files));}}>
      {isFullscreen&&stage.current?createPortal(side,stage.current):side}
      <div ref={stage} className={`stage${expanded?' stage-expanded':''}`}>
        <div className="stage-label"><span className="dot"/> PERSPECTIVE VIEW <span>1:1 / METERS</span></div>
        {isFullscreen&&<button className="workspace-toggle" aria-controls="workspace-panel" aria-expanded={workspaceVisible} onClick={()=>setWorkspaceVisible(v=>!v)}>{workspaceVisible?'Hide workspace':'Show workspace'}</button>}
        <button className="fullscreen-toggle" aria-label={isFullscreen?'Exit fullscreen':'Enter fullscreen'} aria-pressed={isFullscreen} onClick={()=>void toggleFullscreen()}>{isFullscreen?'↙ Exit fullscreen':'⛶ Fullscreen'}</button>
        <button className="capture-launch" aria-expanded={captureOpen} onClick={()=>setCaptureOpen(v=>!v)}>GIF studio</button>
        <WorkspaceViewer workspace={workspace} selected={selected} selectedPart={selectedPart} time={time} focus={focus} region={captureRegion} onSelect={(i,j)=>{setSelected(i);setSelectedPart(j);}}/>
        <CaptureTools open={captureOpen} assets={assets} room={workspace.room} selected={selected} close={()=>setCaptureOpen(false)} onRegion={setCaptureRegion} addAsset={addAsset} workspace={workspace} time={time} roomOperation={roomOperation.current} onFeedback={sendAnimationFeedback}/>
        <div className="hint">{time!==null?`ANIMATION ${time.toFixed(2)}s · `:''}Drag to orbit · Right-drag to pan · Scroll to zoom</div>
      </div>
      <aside className="inspector"><div className="eyebrow">INSPECTOR</div><ProjectInspector item={workspace.items[selected]} selectedPart={selectedPart} selectPart={index=>{setSelectedPart(index);setFocus(n=>n+1);}}/></aside>
    </main><footer><span role="status">{busy?'◌ ':'● '}{status}</span><span>FORMA POWERED · LOCAL + CLOUD</span></footer>
    {adoptionPending&&(isFullscreen&&stage.current?createPortal(<div className="draft-recovery adoption" role="dialog" aria-label="Adopt anonymous draft"><b>Anonymous draft found</b><p>This workspace was created before sign-in. Adopt it into your account, or start a separate clean workspace. The anonymous draft is retained either way.</p><div className="capture-actions"><button onClick={adoptAnonymousDraft}>Adopt draft</button><button onClick={discardAnonymousDraft}>Start clean workspace</button></div></div>,stage.current):<div className="draft-recovery adoption" role="dialog" aria-label="Adopt anonymous draft"><b>Anonymous draft found</b><p>This workspace was created before sign-in. Adopt it into your account, or start a separate clean workspace. The anonymous draft is retained either way.</p><div className="capture-actions"><button onClick={adoptAnonymousDraft}>Adopt draft</button><button onClick={discardAnonymousDraft}>Start clean workspace</button></div></div>)}
    {draftRecovery&&(isFullscreen&&stage.current?createPortal(<div className="draft-recovery" role="alert"><b>Saved workspace needs recovery</b><p>{draftRecovery.message}</p><div className="capture-actions"><button disabled={busy} onClick={()=>{setDraftRecovery(null);setError('');setDraftReady(false);window.location.reload();}}>Retry loading</button><button disabled={busy} onClick={()=>void exportCorruptDraft()}>Download backup</button><button disabled={busy} onClick={()=>void resetCorruptDraft()}>Start clean workspace</button></div></div>,stage.current):<div className="draft-recovery" role="alert"><b>Saved workspace needs recovery</b><p>{draftRecovery.message}</p><div className="capture-actions"><button disabled={busy} onClick={()=>{setDraftRecovery(null);setError('');setDraftReady(false);window.location.reload();}}>Retry loading</button><button disabled={busy} onClick={()=>void exportCorruptDraft()}>Download backup</button><button disabled={busy} onClick={()=>void resetCorruptDraft()}>Start clean workspace</button></div></div>)}
    {error&&(isFullscreen&&stage.current?createPortal(<div className="error" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}>×</button></div>,stage.current):<div className="error" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}>×</button></div>)}
  </>;
}
createRoot(document.getElementById('root')!).render(<App/>);
