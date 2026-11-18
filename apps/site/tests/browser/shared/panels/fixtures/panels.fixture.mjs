import { build } from "esbuild";
import { root, applicationStyles } from "../../../browser.fixture.mjs";

export async function mountPanels(page) {
  const result = await build({
    stdin: {
      contents: `import React,{useState,useRef} from 'react';import{createRoot}from'react-dom/client';import{Panel,PanelStack,PanelLayout}from'./src/shared/panels/index';
function Demo(){const [error,setError]=useState();const [busy,setBusy]=useState(false);const [dirty,setDirty]=useState(false);const ref=useRef(null);window.failPanel=(repeat=false)=>{setBusy(false);setError(repeat?'Repeated failure':{message:'Operation failed'})};window.clearPanel=()=>setError(undefined);window.beginPanel=()=>setBusy(true);return <PanelLayout main={<p>Main preview</p>} panels={<PanelStack>{['Layers','Edit objects','Parameters','Future panel'].map((title,index)=><Panel key={title} title={title} dirty={index===0&&dirty} busy={index===0&&busy} error={index===0?error:undefined} errorFocusRef={index===0?ref:undefined} description={<p>Panel description</p>} actions={<button>Action for {title}</button>}><input aria-label={title+' draft'} onChange={()=>setDirty(true)}/>{index===0&&error&&<div ref={ref} tabIndex={-1} role='alert'>{typeof error==='string'?error:error.message}</div>}</Panel>)}</PanelStack>}/>};function App(){const[project,setProject]=useState(1);window.changeProject=()=>setProject(p=>p+1);return <Demo key={project}/>};createRoot(document.getElementById('root')).render(<App/>);`,
      resolveDir: root + "/apps/site",
      loader: "tsx",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
  });
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({ content: await applicationStyles() });
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await page.getByRole("button", { name: "Layers", exact: true }).waitFor();
}
