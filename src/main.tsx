import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './TabletopApp';
import './styles.css';
import './bear-tavern.css';
import { prepareOnlineEditor } from './lib/online-editor';

document.documentElement.dataset.theme = 'bear-tavern';

const root = ReactDOM.createRoot(document.getElementById('root')!);
void prepareOnlineEditor().then(() => root.render(<React.StrictMode><App /></React.StrictMode>)).catch(error => root.render(<main style={{padding:40,color:'#e8dcc5',background:'#211b14',minHeight:'100vh'}}><h1>熊酒馆编辑器</h1><p>{error.message}</p><button onClick={() => location.reload()}>重新打开</button></main>));
