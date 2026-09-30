import type { SceneItem } from '../lib/workspace';
export type LayoutMode = 'orbit' | 'translate' | 'rotate';
export function LayoutTools({ mode, setMode, grid, setGrid, floor, setFloor, item, disabled, snapFloor, previewing }: {
  mode: LayoutMode; setMode: (mode: LayoutMode) => void; grid: number; setGrid: (grid: number) => void;
  floor: boolean; setFloor: (floor: boolean) => void; item?: SceneItem; disabled: boolean; snapFloor: () => void; previewing: boolean;
}) {
  const unavailable = disabled || !item || item.missing || !item.visible;
  return <div className="layout-tools" role="region" aria-label="Layout tools">
    <div className="layout-modes" role="group" aria-label="Viewport interaction">
      {(['orbit','translate','rotate'] as const).map(value => <button key={value} aria-pressed={mode === value}
        disabled={disabled || (value !== 'orbit' && unavailable)} onClick={() => setMode(value)}>
        {value === 'translate' ? 'Move' : value === 'rotate' ? 'Rotate' : 'Orbit'}
      </button>)}
    </div>
    <label>Drag grid<select aria-label="Drag grid spacing" value={grid} disabled={disabled} onChange={e => setGrid(Number(e.target.value))}>
      <option value={0}>Off</option>{[.1,.25,.5,1].map(n => <option key={n} value={n}>{n} m</option>)}
    </select></label>
    <label className="inline-check"><input type="checkbox" checked={floor} disabled={disabled} onChange={e => setFloor(e.target.checked)} /> Keep on floor during drag</label>
    <button disabled={unavailable || previewing} onClick={snapFloor}>Snap to floor</button>
    <small>{previewing ? 'Move or Rotate returns to the base layout.' : mode === 'orbit' ? 'Select equipment, then Move or Rotate.' : 'Drag colored handles · Esc cancels · Base layout only'}</small>
  </div>;
}
