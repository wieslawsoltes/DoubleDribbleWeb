"""Browser integration tests (Python Playwright; optional development dependency).

Default: inject the standalone HTML into about:blank, exercising Canvas fallback.
Storage in this mode is a deliberate in-memory test double, NOT native persistence.
Use --url http://localhost:8080/?test=1 to test a normally served secure-context app.
No browser navigation policies or security restrictions are modified.
"""
import argparse
import asyncio
import json
import shutil
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'docs' / 'browser-test-results.json'
STORAGE_SCRIPT = """<script>
window.__testStorage = Object.create(null);
Object.defineProperty(window, 'localStorage', {configurable:true, value:{
 getItem(k){return Object.hasOwn(__testStorage,k)?__testStorage[k]:null},
 setItem(k,v){__testStorage[k]=String(v)},removeItem(k){delete __testStorage[k]},
 clear(){for(const k of Object.keys(__testStorage))delete __testStorage[k]}
}});
</script>"""

async def main(args):
    checks=[]
    errors=[]
    def check(name, success, detail=None):
        entry={'name':name,'passed':bool(success)}
        if detail is not None: entry['detail']=detail
        checks.append(entry)
        print(('PASS' if success else 'FAIL'),name,detail or '')
        if not success: raise AssertionError(name)

    async with async_playwright() as p:
        browser=await p.chromium.launch(
            executable_path=args.chromium or shutil.which('chromium'),
            headless=True,args=['--no-sandbox'])
        html=(ROOT/'dist/index.html').read_text()
        html=html.replace("if(query.get('test')==='1')",'if(true)')
        html=html.replace('<head>','<head>'+STORAGE_SCRIPT,1)
        async def make_page(width,height,mobile=False):
            page=await browser.new_page(viewport={'width':width,'height':height},
                device_scale_factor=1,is_mobile=mobile,has_touch=mobile)
            page.on('pageerror',lambda e:errors.append(str(e)))
            if args.url: await page.goto(args.url,wait_until='load')
            else: await page.set_content(html,wait_until='load')
            await page.wait_for_function('window.__DD_DEBUG__ !== undefined',timeout=20000)
            await page.wait_for_timeout(150)
            return page

        page=await make_page(1440,1040)
        info=await page.evaluate('({backend:__DD_DEBUG__.renderer.mode,gpuExposed:!!navigator.gpu,secure:isSecureContext,storage:typeof __testStorage!=="undefined"?"in-memory test double":"native",reason:__DD_DEBUG__.renderer.lastReason})')
        check('standalone HTML boots and renders without external assets',await page.evaluate('__DD_DEBUG__.title && __DD_DEBUG__.renderer.count>50'))
        check('desktop layout has no horizontal overflow',await page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        check('native game canvas is 256 x 240',await page.evaluate('document.querySelector("#fallback-canvas").width===256 && document.querySelector("#gpu-canvas").height===240'))
        await page.screenshot(path=str(ROOT/'docs/preview-desktop.png'),full_page=True)
        await page.locator('[data-mode="versus"]').click()
        await page.locator('[data-team="0"]').click()
        await page.locator('#opponent-select').select_option('3')
        await page.locator('[data-level="3"]').click()
        await page.locator('[data-minutes="10"]').click()
        await page.locator('#start-button').click()
        settings=await page.evaluate('__DD_DEBUG__.game.settings')
        check('setup controls start the selected two-player match',all(settings[k]==v for k,v in {'mode':'versus','team':0,'opponent':3,'level':3,'minutes':10}.items()))
        await page.keyboard.press('Enter')
        check('Enter pauses a running match',await page.evaluate('__DD_DEBUG__.game.s.paused'))
        before=await page.evaluate('__DD_DEBUG__.game.s.frame')
        await page.wait_for_timeout(120)
        check('paused simulation does not advance',await page.evaluate('__DD_DEBUG__.game.s.frame')==before)
        await page.keyboard.press('Enter')
        await page.locator('#help-button').click()
        check('help dialog pauses and suspends game input',await page.evaluate('document.getElementById("help-dialog").open && __DD_DEBUG__.game.s.paused && __DD_DEBUG__.input.suspended'))
        await page.locator('[data-close="help-dialog"]').first.click()
        await page.wait_for_function('!__DD_DEBUG__.input.suspended',timeout=2000)
        check('closing help resumes the previously running match',await page.evaluate('!__DD_DEBUG__.game.s.paused && !__DD_DEBUG__.input.suspended'))

        await page.evaluate('__DD_DEBUG__.start({mode:"practice",seed:22})')
        x=await page.evaluate('__DD_DEBUG__.game.owner.x')
        await page.keyboard.down('ArrowRight');await page.wait_for_timeout(220);await page.keyboard.up('ArrowRight')
        check('keyboard movement controls the ball carrier',await page.evaluate('__DD_DEBUG__.game.owner.x')>x+3)
        await page.keyboard.down('z');await page.wait_for_timeout(350)
        check('holding Z charges a jump shot',await page.evaluate('__DD_DEBUG__.game.owner.charge')>0.15)
        await page.keyboard.up('z');await page.wait_for_timeout(40)
        check('releasing Z shoots the ball',await page.evaluate('__DD_DEBUG__.game.s.ball.kind')=='shot')
        await page.evaluate('__DD_DEBUG__.start({mode:"practice",seed:22})')
        await page.keyboard.press('x');await page.wait_for_timeout(20)
        check('X passes to an aimed teammate',await page.evaluate('__DD_DEBUG__.game.s.ball.kind')=='pass')

        await page.evaluate('__DD_DEBUG__.start({mode:"versus",seed:22}); const g=__DD_DEBUG__.game;g.s.phase="live";g.giveBall(g.s.players[5],true);')
        x=await page.evaluate('__DD_DEBUG__.game.owner.x')
        await page.keyboard.down('l');await page.wait_for_timeout(150);await page.keyboard.up('l')
        check('player two has independent movement keys',await page.evaluate('__DD_DEBUG__.game.s.players[5].x')>x+2)
        await page.keyboard.down('n');await page.wait_for_timeout(150)
        check('player two can charge shots independently',await page.evaluate('__DD_DEBUG__.game.s.players[5].charge')>0)
        await page.keyboard.up('n')

        await page.evaluate('__DD_DEBUG__.start({mode:"practice",seed:888});__DD_DEBUG__.togglePause();__DD_DEBUG__.save();')
        snapshot=await page.evaluate('JSON.parse(localStorage.getItem("dd-browser-v1:match")).data')
        check('save contains the complete paused simulation and RNG',snapshot['state']['paused'] and len(snapshot['state']['players'])==10 and isinstance(snapshot['random'],int))
        await page.locator('#brand-home').click()
        check('home offers a resumable match',await page.locator('#resume-button').is_visible())
        await page.locator('#resume-button').click()
        check('resume restores the saved match',await page.evaluate('__DD_DEBUG__.game.settings.seed===888 && !__DD_DEBUG__.title && !__DD_DEBUG__.game.s.paused'))
        await page.locator('#setup-tab').click();await page.locator('#start-button').click()
        check('replacing a live match requires confirmation',await page.locator('#reset-dialog').is_visible())
        await page.locator('[data-close="reset-dialog"]').click()
        check('canceling reset keeps the original match',await page.evaluate('__DD_DEBUG__.game.settings.seed===888'))
        await page.locator('#crt-toggle').click()
        check('CRT option changes only presentation',await page.evaluate('document.getElementById("screen-window").classList.contains("crt") && __DD_DEBUG__.game.settings.seed===888'))
        await page.locator('#crt-toggle').click()
        await page.locator('#sound-button').click()
        check('mute option persists in preferences',await page.evaluate('!__DD_DEBUG__.prefs.sound && !JSON.parse(localStorage.getItem("dd-browser-v1:preferences")).sound'))

        # Render all special scenes from reproducible simulation fixtures.
        await page.evaluate('__DD_DEBUG__.start({mode:"practice"});const g=__DD_DEBUG__.game;g.step=()=>{g.events=[]};g.s.paused=false;g.s.phase="halftime";g.s.period=2;g.s.phaseTime=2;__DD_DEBUG__.draw()')
        await page.wait_for_timeout(50)
        check('halftime scene renders',await page.evaluate('__DD_DEBUG__.renderer.count>100'))
        await page.evaluate('const g=__DD_DEBUG__.game;g.s.phase="final";g.s.winner=0;g.s.score=[102,99];__DD_DEBUG__.updateUI();__DD_DEBUG__.draw()')
        check('final score and three-digit scores render',await page.locator('#stats-score-home').text_content()=='102')
        await page.screenshot(path=str(ROOT/'docs/preview-final.png'),full_page=True)
        await page.evaluate('__DD_DEBUG__.start({mode:"practice"});const g=__DD_DEBUG__.game;g.owner.x=430;g.owner.y=102;g.beginShot(g.owner);g.s.phaseTime=.45;g.step=()=>{g.events=[]};g.s.paused=false;__DD_DEBUG__.updateUI();__DD_DEBUG__.draw()')
        check('dunk close-up scene renders',await page.evaluate('__DD_DEBUG__.game.s.phase==="dunk" && __DD_DEBUG__.renderer.count>20'))
        await page.screenshot(path=str(ROOT/'docs/preview-dunk.png'),full_page=True)

        await page.evaluate('__DD_DEBUG__.start({mode:"championship",level:1,periodSeconds:1});const g=__DD_DEBUG__.game;g.s.period=4;g.s.score=[6,2];g.s.phase="live";g.s.clock=.001;g.giveBall(g.s.players[0],true);')
        # The short final-period fixture emits the real final event on its next tick.
        await page.evaluate('__DD_DEBUG__.step(1)')
        await page.keyboard.press('Enter')
        check('winning a championship match advances the difficulty',await page.evaluate('__DD_DEBUG__.game.settings.level===2'))

        # Hardware gamepads are not required: test standard Gamepad API mappings.
        await page.evaluate('''window.__pad={connected:true,axes:[1,-1],buttons:Array.from({length:16},()=>({pressed:false}))};__pad.buttons[0].pressed=true;Object.defineProperty(navigator,"getGamepads",{configurable:true,value:()=>[__pad]});''')
        check('standard gamepad axes and A button map correctly',await page.evaluate('(()=>{const x=__DD_DEBUG__.input.sample()[0];return x.x===1 && x.y===-1 && x.a})()'))
        await page.evaluate('__pad.connected=false')
        await page.evaluate('__DD_DEBUG__.start({mode:"practice",seed:9})')
        await page.wait_for_timeout(150)
        await page.screenshot(path=str(ROOT/'docs/preview-game.png'),full_page=True)

        mobile=await make_page(390,844,True)
        check('mobile layout has no horizontal overflow',await mobile.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        check('mobile touch controls are visible',await mobile.locator('#touch-stick').is_visible())
        await mobile.evaluate('__DD_DEBUG__.start({mode:"practice",seed:9})')
        await mobile.locator('#touch-controls').scroll_into_view_if_needed()
        stick=await mobile.locator('#touch-stick').bounding_box()
        shoot=await mobile.locator('[data-pad="b"]').bounding_box()
        points=[{'id':1,'x':stick['x']+stick['width']*.85,'y':stick['y']+stick['height']*.5},
                {'id':2,'x':shoot['x']+shoot['width']/2,'y':shoot['y']+shoot['height']/2}]
        cdp=await mobile.context.new_cdp_session(mobile)
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':points})
        await mobile.wait_for_timeout(150)
        check('emulated multitouch holds movement and shoot simultaneously',await mobile.evaluate('__DD_DEBUG__.input.touch.x===1 && __DD_DEBUG__.input.touch.b'))
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        await mobile.wait_for_timeout(40)
        check('touch release clears both captured pointers',await mobile.evaluate('__DD_DEBUG__.input.touch.x===0 && !__DD_DEBUG__.input.touch.b && __DD_DEBUG__.input.pointers.size===0'))
        await mobile.screenshot(path=str(ROOT/'docs/preview-mobile.png'),full_page=True)
        await mobile.set_viewport_size({'width':320,'height':740})
        check('320px narrow layout has no horizontal overflow',await mobile.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        check('no uncaught JavaScript errors across desktop and mobile tests',not errors,errors)
        REPORT.parent.mkdir(parents=True,exist_ok=True)
        REPORT.write_text(json.dumps({'environment':info,'checks':checks,'errors':errors},indent=2)+'\n')
        print(json.dumps({'passed':len(checks),'environment':info},indent=2))
        await browser.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',help='An already running game URL with ?test=1')
    parser.add_argument('--chromium',help='Chromium executable; otherwise use PATH or Playwright browser')
    asyncio.run(main(parser.parse_args()))
