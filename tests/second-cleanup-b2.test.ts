import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
test("closing dialog restores opener keyboard focus", async () => {
 const bundle=await build({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import {Modal} from './src/components/ui/dialog'; function Fixture(){const [open,set]=React.useState(false); return <><button id="opener" onClick={()=>set(true)}>Open</button><Modal open={open} onOpenChange={set} title="Test"><button>Inside</button></Modal></>}; createRoot(document.getElementById('root')).render(<Fixture/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic'});
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 try {const page=await browser.newPage(); await page.setContent('<div id="root"></div>'); await page.addScriptTag({content:bundle.outputFiles[0].text}); await page.locator('#opener').focus(); await page.keyboard.press('Enter'); await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({state:'hidden'}); await page.waitForTimeout(100); assert.equal(await page.evaluate(()=>document.activeElement?.id),'opener');} finally {await browser.close()}
});