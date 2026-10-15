import StudentPreviewApp from './copy-review/StudentPreviewApp';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { PLATFORM_NAME } from './student/space/identity'

document.title = PLATFORM_NAME
if(window.location.pathname==='/student-copy-preview')window.__PBL_COPY_PREVIEW__=true;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {window.location.pathname==='/student-copy-preview'?<StudentPreviewApp/>:<App/>}
  </StrictMode>,
)
