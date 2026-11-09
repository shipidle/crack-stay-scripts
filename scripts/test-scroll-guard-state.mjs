// Deterministic event-order regressions. Complements the real-browser suite;
// this models event order and layout metrics, not Safari's rendering engine.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(process.argv[2] || new URL('../Crack_Scroll_Guard.user.js', import.meta.url), 'utf8');
function harness(desktop=false) {
  let now = 10000, id = 0;
  const timers = new Map(), listeners = new Map();
  const on = (scope, type, fn) => {const key=scope+':'+type;listeners.set(key,[...(listeners.get(key)||[]),fn]);};
  const fire = (scope, type, data={}) => {for(const fn of listeners.get(scope+':'+type)||[])fn({type,...data});};
  class Element {
    constructor(tag='DIV') {this.tagName=tag;this.parentElement=null;this.isConnected=true;this.clientHeight=600;this.scrollHeight=8000;this._top=0;this.style={};this.id='';}
    get scrollTop(){return this._top;}
    set scrollTop(v){this._top=Math.max(0,Math.min(Number(v),this.scrollHeight-this.clientHeight));}
    contains(node){for(;node;node=node.parentElement)if(node===this)return true;return false;}
    matches(selector){return /textarea/.test(selector)&&this.tagName==='TEXTAREA';}
    closest(selector){return this.matches(selector)||(this.tagName==='BUTTON'&&selector.includes('button'))?this:null;}
    querySelector(){return null;}
    querySelectorAll(){return [];}
    getAttribute(name){return this.attributes?.[name]??null;}
    setAttribute(){}
    getBoundingClientRect(){return {left:0,right:390,top:0,bottom:600,width:390,height:600};}
    scrollTo(a,b){rawSet.call(this,typeof a==='object'?a.top:b);}
    scroll(a,b){this.scrollTo(a,b);}
    scrollBy(a,b){rawSet.call(this,this.scrollTop+(typeof a==='object'?a.top:b));}
    focus(options){document.activeElement=this;if(!options?.preventScroll)rawSet.call(host,7400);fire('document','focusin',{target:this});}
  }
  const rawSet=Object.getOwnPropertyDescriptor(Element.prototype,'scrollTop').set;
  const body=new Element('BODY'),root=new Element('HTML'),host=new Element('MAIN'),editor=new Element('TEXTAREA');
  host.parentElement=body;body.parentElement=root;editor.parentElement=host;editor.scrollHeight=100;editor.clientHeight=100;
  root.scrollHeight=root.clientHeight=844;body.scrollHeight=body.clientHeight=844;
  const document={body,documentElement:root,scrollingElement:root,activeElement:body,hidden:false,
    addEventListener:(type,fn)=>on('document',type,fn),querySelector:selector=>selector==='.__chat_input_textarea'?(desktop?editor:null):host,querySelectorAll:()=>[],elementFromPoint:()=>null};
  const window={document,Element,HTMLElement:Element,innerWidth:390,innerHeight:844,
    history:{pushState(){},replaceState(){}},location:{pathname:'/characters/test/chats/test'},
    getComputedStyle:el=>({overflowY:el===host?'auto':'visible',position:'static'}),
    addEventListener:(type,fn)=>on('window',type,fn),matchMedia:()=>({matches:desktop}),
    visualViewport:{addEventListener:(type,fn)=>on('viewport',type,fn)},
    MutationObserver:class{observe(){}disconnect(){}}};
  const sandbox={window,unsafeWindow:window,console,Date:{now:()=>now},
    setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:key=>timers.delete(key),
    setInterval:()=>++id,clearInterval(){}};
  vm.runInNewContext(source,sandbox);
  function tick(ms){now+=ms;for(let i=0;i<50;i++){const due=[...timers].filter(([,v])=>v.at<=now);if(!due.length)return;for(const [key,v]of due){timers.delete(key);v.fn();}}throw Error('timer loop');}
  const touch=(type,y=300,target=host)=>fire('document',type,{target,touches:type==='touchend'?[]:[{clientY:y}]});
  const nativeTo=top=>{rawSet.call(host,top);fire('document','scroll',{target:host});};
  function arm(active=false){nativeTo(1400);touch('touchstart',200);touch('touchmove',300);nativeTo(1200);if(!active){touch('touchend');tick(350);}}
  return {host,editor,document,window,fire,touch,nativeTo,arm,tick,Element};
}
const tests = [
 ['upward swipe rejects cached jump short of bottom', h=>{h.arm(true);h.nativeTo(2600);assert.equal(h.host.scrollTop,1200);}],
 ['upward inertia rejects cached jump short of bottom', h=>{h.arm(true);h.touch('touchend');h.tick(30);h.nativeTo(2600);assert.equal(h.host.scrollTop,1200);}],
 ['focused composer does not disable deliberate history swipe', h=>{h.editor.focus();h.arm();h.host.scrollTop=7400;assert.equal(h.host.scrollTop,1200);assert.equal(h.document.activeElement,h.editor);}],
 ['viewport resize and completion refocus retain manual reading', h=>{h.editor.focus();h.arm();h.fire('viewport','resize');h.editor.focus();h.host.scrollTop=7400;assert.equal(h.host.scrollTop,1200);}],
 ['completion refocus after an ordinary swipe preserves position', h=>{h.arm();h.editor.focus();h.host.scrollTop=7400;assert.equal(h.host.scrollTop,1200);assert.equal(h.document.activeElement,h.editor);}],
 ['real composer tap still releases protection', h=>{h.arm();h.touch('touchstart',300,h.editor);h.editor.focus();h.host.scrollTop=7400;assert.equal(h.host.scrollTop,7400);}],
 ['downward manual movement remains allowed', h=>{h.arm();h.touch('touchstart',500);h.touch('touchmove',400);h.nativeTo(1500);h.touch('touchend');h.tick(350);assert.equal(h.host.scrollTop,1500);}],
 ['upward natural inertia remains allowed', h=>{h.arm(true);h.touch('touchend');for(let n=0;n<8;n++){h.tick(50);h.nativeTo(1180-n*20);}h.tick(350);assert.equal(h.host.scrollTop,1040);}],
 ['prepend anchoring during touch remains allowed', h=>{h.arm(true);h.host.scrollHeight+=1000;h.nativeTo(2200);assert.equal(h.host.scrollTop,2200);}],
 ['cached bottom snap remains blocked', h=>{h.arm(true);h.nativeTo(7400);assert.equal(h.host.scrollTop,1200);}],
 ['interrupted touch cannot disable idle protection after return', h=>{h.arm(true);h.document.hidden=true;h.fire('document','visibilitychange');h.document.hidden=false;h.fire('document','visibilitychange');h.nativeTo(2600);h.tick(200);assert.equal(h.host.scrollTop,1200);}],
 ['explicit latest button still releases guard', h=>{h.arm();const button=new h.Element('BUTTON');button.attributes={'aria-label':'최신 메시지'};h.fire('document','click',{target:button,isTrusted:true});h.host.scrollTop=7400;assert.equal(h.host.scrollTop,7400);}],
 ['desktop reply stays pinned', h=>{h.editor.focus();h.fire('document','keydown',{target:h.editor,key:'Enter',isTrusted:true});h.host.scrollHeight+=1000;h.host.scrollTop=8400;assert.equal(h.host.scrollTop,7400);}],
 ['desktop wheel still moves freely', h=>{h.fire('document','wheel',{target:h.host,deltaY:-200});h.nativeTo(1200);h.tick(350);h.fire('document','wheel',{target:h.host,deltaY:300});h.nativeTo(1500);h.tick(350);assert.equal(h.host.scrollTop,1500);}],
 ['viewport resize allows outer page geometry to settle', h=>{h.arm();h.document.documentElement.scrollHeight=1800;h.fire('viewport','resize');h.document.documentElement.scrollTop=150;assert.equal(h.document.documentElement.scrollTop,150);h.nativeTo(1200);assert.equal(h.document.documentElement.scrollTop,150);h.host.scrollTop=7400;assert.equal(h.host.scrollTop,1200);}],
];
let failed=0;
for(const [name,test]of tests){try{test(harness(name.startsWith('desktop ')));console.log('PASS',name);}catch(error){failed++;console.log('FAIL',name,'—',error.message);}}
process.exitCode=failed?1:0;
