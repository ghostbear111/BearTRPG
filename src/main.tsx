import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './TabletopApp';
import './styles.css';
import './bear-tavern.css';

document.documentElement.dataset.theme = 'bear-tavern';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
