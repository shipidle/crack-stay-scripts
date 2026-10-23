"""Offline Chromium regressions for Crack's userscript.
Run: python scripts/test-scroll-guard.py [path/to/Crack_Scroll_Guard.user.js]
Requires: pip install playwright; playwright install chromium
CHROMIUM_PATH may point to a system Chromium. No login/network/AI calls are used.
Synthetic native-scroll tests use the setter captured BEFORE installing the guard.
The CDP swipe tests additionally exercise actual Chromium touch scrolling.
This is not an iPhone Safari or Stay integration test.
"""
import json
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

DEFAULT = Path(__file__).resolve().parents[1] / 'Crack_Scroll_Guard.user.js'
SOURCE = Path(sys.argv[1] if len(sys.argv) > 1 else DEFAULT).read_text(encoding='utf-8')
HTML = '''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;min-height:1800px}main{margin:20px 10px;width:370px;height:600px;overflow:auto;position:relative;overflow-anchor:none}
.wrtn-markdown p{height:80px;margin:0;font-size:16px}.fixed{position:fixed;left:10px;top:20px;width:370px;height:500px;z-index:100}
</style><main id="host"><div class="wrtn-markdown">''' + ''.join(f'<p id="m{i}">Message {i}</p>' for i in range(100)) + '''<textarea id="editor"></textarea></div></main><button aria-label="최신 메시지">Latest</button>'''
BOOT = '''() => {
 window.host = document.querySelector('main');
 // Routing is a stub so these fixtures need no navigation or server.
 // The real DOM, rendering, scroll methods and touch compositor remain in use.
 window.testLocation = {pathname:'/characters/test/chats/test'};
 window.testHistory = {pushState(a,b,url){testLocation.pathname=url;},replaceState(a,b,url){testLocation.pathname=url;}};
 window.pageWorld = new Proxy(window,{
   get(target,key){
     if(key==='location')return testLocation;
     if(key==='history')return testHistory;
     const value=Reflect.get(target,key,target);
     if(['addEventListener','removeEventListener','getComputedStyle','matchMedia','scroll','scrollBy','scrollTo'].includes(key)&&typeof value==='function')return value.bind(target);
     return value;
   },set(target,key,value){return Reflect.set(target,key,value,target);}
 });
 window.installSource = source => new Function('window','location','history','unsafeWindow',source)(pageWorld,testLocation,testHistory,pageWorld);
 const desc = Object.getOwnPropertyDescriptor(Element.prototype,'scrollTop');
 window.rawSet = desc.set;
 window.rawScrollTo = Element.prototype.scrollTo;
 window.writes = [];
 Object.defineProperty(Element.prototype,'scrollTop',{...desc,set(v){writes.push({id:this.id,top:v});desc.set.call(this,v);}});
 window.emitTouch = (type,y=300) => {
   const touch = new Touch({identifier:1,target:host,clientX:180,clientY:y});
   host.dispatchEvent(new TouchEvent(type,{bubbles:true,touches:type==='touchend'?[]:[touch],changedTouches:[touch]}));
 };
 window.nativeTo = v => {rawSet.call(host,v);host.dispatchEvent(new Event('scroll'));};
 window.maxTop = () => host.scrollHeight-host.clientHeight;
}'''
# Model separate userscript prototypes; this is not a real Stay extension world.
# unsafeWindow supplies the page. v1.3.0 ignores it, while v1.4.0 patches it.
ISOLATED = '''source => {
 function LocalElement(){}; LocalElement.prototype=Object.create(Element.prototype);
 Object.defineProperty(LocalElement.prototype,'scrollTop',Object.getOwnPropertyDescriptor(Element.prototype,'scrollTop'));
 function LocalHTMLElement(){}; LocalHTMLElement.prototype=Object.create(HTMLElement.prototype);
 const local = {addEventListener:window.addEventListener.bind(window),scroll(){},scrollTo(){},scrollBy(){}};
 new Function('window','Element','HTMLElement','location','history','unsafeWindow',source)(local,LocalElement,LocalHTMLElement,testLocation,testHistory,pageWorld);
}'''

def near(value, expected, tolerance=3):
    assert abs(value-expected) <= tolerance, f'expected {expected}, got {value}'

def arm(page, active=False, inertia=False):
    page.evaluate("() => {nativeTo(1400);emitTouch('touchstart',200);emitTouch('touchmove',300);nativeTo(1200);}")
    if not active:
        page.evaluate("emitTouch('touchend')")
        page.wait_for_timeout(25 if inertia else 350)
    page.evaluate('writes=[]')

def touch_reply(p):
    arm(p, active=True)
    near(p.evaluate('host.scrollTop=maxTop();host.scrollTop'),1200)

def inertia_reply(p):
    arm(p, inertia=True)
    near(p.evaluate("host.scrollTo({top:maxTop(),behavior:'instant'});host.scrollTop"),1200)

def before_first_scroll(p):
    p.evaluate("nativeTo(1200);emitTouch('touchstart',200)")
    near(p.evaluate('host.scrollTop=maxTop();host.scrollTop'),1200)

def start_alignment(p):
    arm(p)
    near(p.evaluate("""() => {const box=host.getBoundingClientRect();const m=[...host.querySelectorAll('p')].find(m=>{const r=m.getBoundingClientRect();return r.top>box.top+100&&r.bottom<box.bottom;});m.scrollIntoView({block:'start',behavior:'instant'});return host.scrollTop;}"""),1200)

def center_alignment(p):
    arm(p)
    near(p.evaluate("""() => {const box=host.getBoundingClientRect();const m=[...host.querySelectorAll('p')].find(m=>{const r=m.getBoundingClientRect();return r.top>box.top+360&&r.bottom<box.bottom;});m.scrollIntoView({block:'center',behavior:'instant'});return host.scrollTop;}"""),1200)

def nearest_alignment(p):
    arm(p)
    near(p.evaluate("document.querySelector('#m18').scrollIntoView({block:'nearest',behavior:'instant'});host.scrollTop"),1200)

def cached_upward_reply(p):
    arm(p,inertia=True)
    p.evaluate('nativeTo(maxTop())')
    p.wait_for_timeout(350)
    near(p.evaluate('host.scrollTop'),1200)

def idle_cached_reply(p):
    arm(p)
    p.evaluate('nativeTo(maxTop())')
    p.wait_for_timeout(230)
    near(p.evaluate('host.scrollTop'),1200)

def overlay_reply(p):
    p.evaluate("host.insertAdjacentHTML('beforeend','<div class=\"fixed\">overlay</div>')")
    arm(p)
    p.evaluate('nativeTo(maxTop())')
    p.wait_for_timeout(230)
    near(p.evaluate('host.scrollTop'),1200)

def replace_container(p):
    arm(p)
    near(p.evaluate('''() => {const replacement=host.cloneNode(true);host.replaceWith(replacement);host=replacement;host.scrollTo({top:maxTop(),behavior:'instant'});return host.scrollTop;}'''),1200)

def outer_jump(p):
    arm(p)
    near(p.evaluate("window.scrollTo({top:800,behavior:'instant'});document.scrollingElement.scrollTop"),0)

def initial_entry(p):
    p.evaluate("host.scrollTo({top:maxTop(),behavior:'instant'})")
    near(p.evaluate('host.scrollTop'),p.evaluate('maxTop()'))

def native_inertia(p):
    arm(p,inertia=True)
    for i in range(14):
        p.evaluate('nativeTo',1180-i*20)
        p.wait_for_timeout(60)
    p.wait_for_timeout(350)
    near(p.evaluate('host.scrollTop'),920)
    assert p.evaluate('writes.length') == 0, 'guard wrote scrollTop during natural inertia'

def downward_inertia(p):
    arm(p)
    p.evaluate("emitTouch('touchstart',500);emitTouch('touchmove',400);nativeTo(1400);emitTouch('touchend')")
    p.evaluate('writes=[]')
    for i in range(14):
        p.evaluate('nativeTo',1450+i*30)
        p.wait_for_timeout(60)
    p.wait_for_timeout(350)
    near(p.evaluate('host.scrollTop'),1840)
    assert p.evaluate('writes.length') == 0, 'guard fought downward inertia'

def user_bottom(p):
    arm(p)
    p.evaluate("emitTouch('touchstart',500);emitTouch('touchmove',300);nativeTo(maxTop());emitTouch('touchend')")
    p.wait_for_timeout(350)
    p.evaluate("host.querySelector('.wrtn-markdown').insertAdjacentHTML('beforeend','<p>New reply</p>');host.scrollTop=maxTop()")
    near(p.evaluate('host.scrollTop'),p.evaluate('maxTop()'))

def focus_reply(p):
    arm(p,active=True)
    p.evaluate("document.querySelector('#editor').focus()")
    near(p.evaluate('host.scrollTop'),1200)
    assert p.evaluate("document.activeElement.id") == 'editor', 'focus itself was blocked'

def route_change(p):
    arm(p)
    p.evaluate("testHistory.pushState({},'', '/characters/other/chats/other');host.scrollTo({top:maxTop(),behavior:'instant'})")
    near(p.evaluate('host.scrollTop'),p.evaluate('maxTop()'))
    arm(p)
    near(p.evaluate('host.scrollTop=maxTop();host.scrollTop'),1200)

def nonchat(p):
    p.evaluate("testHistory.pushState({},'', '/explore')")
    arm(p)
    p.evaluate('host.scrollTop=maxTop()')
    near(p.evaluate('host.scrollTop'),p.evaluate('maxTop()'))

def explicit_latest(p):
    arm(p)
    p.evaluate("document.querySelector('button').onclick=()=>host.scrollTop=maxTop()")
    p.locator('button').click()
    near(p.evaluate('host.scrollTop'),p.evaluate('maxTop()'))

def cdp_swipe(p):
    p.evaluate('nativeTo(3000);writes=[]')
    client=p.context.new_cdp_session(p)
    client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':180,'y':220}]})
    for y in range(240,520,20):
        client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':180,'y':y}]})
        p.wait_for_timeout(20)
    client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    p.wait_for_timeout(900)
    assert p.evaluate('host.scrollTop') < 2850, 'trusted touch did not scroll the content'
    assert p.evaluate('writes.length') == 0, 'guard interfered with actual Chromium touch scrolling'
    old=p.evaluate('host.scrollTop')
    p.evaluate('host.scrollTop=maxTop()')
    near(p.evaluate('host.scrollTop'),old)

def desktop_reply(p):
    p.evaluate("editor.classList.add('__chat_input_textarea');nativeTo(maxTop())")
    p.locator('#editor').focus()
    before=p.evaluate('host.scrollTop')
    p.keyboard.press('Enter')
    p.evaluate("document.querySelector('.wrtn-markdown').insertAdjacentHTML('beforeend','<p>New reply</p>');host.scrollTop=maxTop()")
    near(p.evaluate('host.scrollTop'),before)
    p.evaluate('rawSet.call(host,maxTop());host.dispatchEvent(new Event("scroll"))')
    p.wait_for_timeout(250)
    near(p.evaluate('host.scrollTop'),before)
    p.evaluate("document.querySelector('button').onclick=()=>host.scrollTop=maxTop()")
    p.locator('button').click()
    near(p.evaluate('host.scrollTop'),p.evaluate('maxTop()'))

def desktop_send_click(p):
    p.evaluate("editor.classList.add('__chat_input_textarea');editor.insertAdjacentHTML('afterend','<button id=send>Send</button>');nativeTo(maxTop())")
    before=p.evaluate('host.scrollTop')
    p.locator('#send').click()
    before=p.evaluate('host.scrollTop')
    p.evaluate("document.querySelector('.wrtn-markdown').insertAdjacentHTML('beforeend','<p>Reply</p>');host.scrollTo(0,maxTop())")
    near(p.evaluate('host.scrollTop'),before)

def desktop_fast_wheel(p):
    p.evaluate("editor.classList.add('__chat_input_textarea')")
    p.locator('#editor').focus()
    p.keyboard.press('Enter')
    # A fast wheel/page movement to bottom is user input, not an app snap.
    p.evaluate("""() => {
      host.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-100}));
      nativeTo(1200);
    }""")
    p.wait_for_timeout(350)
    p.evaluate("""() => {
      host.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:9000}));
      nativeTo(maxTop());
    }""")
    near(p.evaluate('host.scrollTop'),p.evaluate('maxTop()'))
    p.wait_for_timeout(350)
    near(p.evaluate('host.scrollTop'),p.evaluate('maxTop()'))
    before=p.evaluate('host.scrollTop')
    p.evaluate("document.querySelector('.wrtn-markdown').insertAdjacentHTML('beforeend','<p>Reply</p>');host.scrollTop=maxTop()")
    near(p.evaluate('host.scrollTop'),before)

def desktop_scrollbar_track(p):
    arm(p)
    p.evaluate("""() => {
      const r=host.getBoundingClientRect();
      host.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',clientX:r.right-2}));
      nativeTo(maxTop());
      host.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'mouse'}));
    }""")
    p.wait_for_timeout(350)
    near(p.evaluate('host.scrollTop'),p.evaluate('maxTop()'))

def desktop_ctrl_enter_completion(p):
    p.evaluate("""() => {
      editor.classList.add('__chat_input_textarea');
      editor.placeholder='메시지';
      editor.insertAdjacentHTML('afterend','<button id="send">Send</button>');
      window.testSends=0; send.onclick=()=>testSends++;
      window.GM_addStyle=()=>{};
      nativeTo(maxTop());
    }""")
    optimizer=(DEFAULT.parent / 'Crack_Linebreak_Optimizer.user.js').read_text(encoding='utf-8')
    p.evaluate(optimizer)
    p.locator('#editor').focus()
    before=p.evaluate('host.scrollTop')
    p.keyboard.press('Control+Enter')
    assert p.evaluate('testSends') == 1, 'Ctrl+Enter must click Send once'
    p.evaluate("document.querySelector('.wrtn-markdown').insertAdjacentHTML('beforeend','<p>Streaming reply</p>');host.scrollTop=maxTop()")
    near(p.evaluate('host.scrollTop'),before)
    p.evaluate("""() => {
      host.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-350}));
      nativeTo(host.scrollTop-350);
    }""")
    p.wait_for_timeout(350)
    reading=p.evaluate('host.scrollTop')
    assert reading < before
    p.evaluate("""() => {
      document.querySelector('.wrtn-markdown').insertAdjacentHTML('beforeend','<p>Completed reply</p>');
      editor.blur();
      editor.focus();
      host.scrollTop=maxTop();
    }""")
    near(p.evaluate('host.scrollTop'),reading)
    p.wait_for_timeout(350)
    near(p.evaluate('host.scrollTop'),reading)
    p.evaluate("document.querySelector('body > button').onclick=()=>host.scrollTop=maxTop()")
    p.locator('body > button').click()
    near(p.evaluate('host.scrollTop'),p.evaluate('maxTop()'))

def desktop_wheel_before_event(p):
    p.evaluate("editor.classList.add('__chat_input_textarea')")
    p.locator('#editor').focus()
    p.keyboard.press('Enter')
    p.evaluate("""() => {
      host.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-100}));
      nativeTo(1200);
    }""")
    p.wait_for_timeout(350)
    p.evaluate('writes=[]')
    # Compositor position is already newer when the next wheel callback arrives.
    p.evaluate("""() => {
      rawSet.call(host,1320);
      host.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:120}));
      host.dispatchEvent(new Event('scroll'));
    }""")
    near(p.evaluate('host.scrollTop'),1320)
    p.wait_for_timeout(350)
    near(p.evaluate('host.scrollTop'),1320)
    assert p.evaluate('writes.length') == 0, 'manual wheel must not trigger restoration writes'
    p.evaluate('host.scrollTop=maxTop()')
    near(p.evaluate('host.scrollTop'),1320)

CASES=[
 ('desktop compositor wheel before event',desktop_wheel_before_event),
 ('desktop Ctrl Enter with optimizer and completion focus',desktop_ctrl_enter_completion),
 ('desktop fast wheel reaches bottom',desktop_fast_wheel),
 ('desktop scrollbar track click',desktop_scrollbar_track),
 ('desktop reply without scrolling',desktop_reply),
 ('desktop send button without scrolling',desktop_send_click),
 ('reply during touch',touch_reply),('reply during inertia',inertia_reply),
 ('arm before first scroll',before_first_scroll),('visible message block:start',start_alignment),
 ('visible message block:center',center_alignment),('visible message nearest',nearest_alignment),
 ('cached setter during upward inertia',cached_upward_reply),('cached setter while idle',idle_cached_reply),
 ('fixed overlay is not an anchor',overlay_reply),('container replacement before app scroll',replace_container),
 ('outer window jump',outer_jump),('initial latest allowed',initial_entry),
 ('upward native inertia stays smooth',native_inertia),('downward native inertia stays smooth',downward_inertia),
 ('manual bottom restores follow',user_bottom),('completion focus retains position',focus_reply),
 ('route change resets lock',route_change),('nonchat is unaffected',nonchat),
 ('explicit latest button',explicit_latest),('trusted Chromium swipe',cdp_swipe),
 ('page realm interception',touch_reply),
]
results=[]
with sync_playwright() as pw:
    opts={'headless':True,'args':['--no-sandbox']}
    executable=os.environ.get('CHROMIUM_PATH')
    if executable: opts['executable_path']=executable
    browser=pw.chromium.launch(**opts)
    for name,case in CASES:
        if os.environ.get('SCROLL_TEST_CASE') and os.environ['SCROLL_TEST_CASE'] != name:
            continue
        desktop=name.startswith('desktop ')
        context=browser.new_context(viewport={'width':390,'height':844},is_mobile=not desktop,has_touch=not desktop,device_scale_factor=1)
        page=context.new_page()
        page.set_content(HTML)
        errors=[]
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.evaluate(BOOT)
        try:
            if name=='page realm interception': page.evaluate(ISOLATED,SOURCE)
            else: page.evaluate("installSource",SOURCE)
            case(page)
            assert not errors, '; '.join(errors)
            result={'case':name,'pass':True}
        except Exception as error:
            result={'case':name,'pass':False,'error':(str(error).splitlines() or [type(error).__name__])[0]}
        results.append(result)
        print(('PASS ' if result['pass'] else 'FAIL ')+name+(' — '+result.get('error','') if not result['pass'] else ''),flush=True)
        context.close()
    print(json.dumps({'script':sys.argv[1:] or [str(DEFAULT)],'browser':browser.version,'results':results},ensure_ascii=False))
    browser.close()
sys.exit(0 if all(r['pass'] for r in results) else 1)
