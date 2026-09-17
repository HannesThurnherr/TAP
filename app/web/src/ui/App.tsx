import { useStore } from '../state/store'
import { AreaPicker } from './AreaPicker'
import { Editor } from './Editor'
import { ProjectBar } from './ProjectBar'
import { Presentation } from './Presentation'

export function App() {
  const screen = useStore(s => s.screen)
  return <div className="app-shell"><ProjectBar/><div className="app-workspace">{screen === 'area' ? <AreaPicker /> : screen === 'present' ? <Presentation /> : <Editor />}</div></div>
}
