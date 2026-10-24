import { render } from 'preact'
import { App } from './App'
import './mobile-hunt-autostart'
import './styles.css'
import './zoom.css'
import './hunt.css'
import './hunt-route-v2.css'
import './hunt-scan.css'
import './account-control.css'
import './panel.css'
import './hunt-assist.css'

render(<App />, document.getElementById('app')!)
