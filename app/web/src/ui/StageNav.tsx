import {useStore} from '../state/store'
export function StageNav(){
 const screen=useStore(s=>s.screen)
 return <nav className="stage-nav" aria-label="Arbeitsschritte">{([['area','1 · Gebiet'],['editor','2 · Manöver'],['export','3 · Export']] as const).map(([s,label])=><button key={s} aria-current={screen===s?'step':undefined} className={screen===s?'on':''} onClick={()=>{const st=useStore.getState();st.setPlaying(false);st.setTool('select');st.clearDraft();st.setFollow(s==='export'&&st.config.shots.length>0);st.setScreen(s)}}>{label}</button>)}</nav>
}
