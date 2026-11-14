// Video Visor 0.11 title engine: presets made of separate pieces (panel, bar, label, headline,
// supporting line, number ...) that each animate on their own schedule. Everything is a pure function
// of time, so the preview and the export draw exactly the same frame.
(function(root){
'use strict';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const ease={
 linear:x=>clamp(x),
 out:x=>1-Math.pow(1-clamp(x),3),
 expo:x=>{x=clamp(x);return x>=1?1:1-Math.pow(2,-10*x);},
 inOut:x=>{x=clamp(x);return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;},
 // Settles with one small overshoot, like a light spring.
 spring:x=>{x=clamp(x);return x>=1?1:1-Math.exp(-6.5*x)*Math.cos(9.5*x);},
 back:x=>{x=clamp(x);const c=1.70158;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2);}
};
const fonts=[['Graphik','Company'],['DM Sans','Clean sans'],['Space Grotesk','Modern'],['DM Serif Display','Editorial serif'],['Oswald','Condensed bold'],['DM Mono','Mono'],['Caveat','Handwritten']];
const categories=[['titles','Titles'],['lower','Lower thirds'],['chapters','Chapters'],['callouts','Callouts'],['numbers','Numbers']]; /* 0.15: Quotes merged into Titles and Lower thirds */
const legibility=[['soft','Soft shadow'],['strong','Strong shadow'],['outline','Outline'],['scrim','Dark glow behind'],['none','None']];

// Motion recipes. Per piece: d = delay (s), t = duration (s), e = easing, from = starting offsets
// (o opacity, x/y in % of the piece, s/sx/sy scale, r degrees), mask = slide out from behind an edge,
// split = animate each word or letter in turn, st = gap between them (s).
const motions={
 'mask-up':{label:'Rise from mask',panel:{d:0,t:.55,e:'expo',from:{sx:0}},bar:{d:0,t:.5,e:'expo',from:{sx:0,sy:0}},frame:{d:0,t:.8,e:'inOut'},mark:{d:0,t:.6,e:'spring',from:{s:.4,o:0}},kicker:{d:.08,t:.55,e:'expo',from:{y:115},mask:1},main:{d:.14,t:.75,e:'expo',from:{y:115},mask:1,split:'word',st:.05},num:{d:.1,t:.7,e:'expo',from:{y:115},mask:1},sub:{d:.42,t:.6,e:'expo',from:{y:115},mask:1},hl:{d:.3,t:.6,e:'expo',from:{sx:0}},badge:{d:0,t:.6,e:'spring',from:{s:0}}},
 'word-rise':{label:'Word by word',panel:{d:0,t:.5,e:'expo',from:{o:0,y:12}},bar:{d:.05,t:.6,e:'expo',from:{sx:0,sy:0}},frame:{d:0,t:.8,e:'inOut'},mark:{d:0,t:.6,e:'spring',from:{s:.4,o:0}},kicker:{d:.05,t:.5,e:'out',from:{o:0,y:40}},main:{d:.12,t:.6,e:'expo',from:{y:60,o:0},split:'word',st:.085},num:{d:.1,t:.6,e:'expo',from:{y:60,o:0}},sub:{d:.5,t:.6,e:'out',from:{o:0,y:40}},hl:{d:.35,t:.6,e:'expo',from:{sx:0}},badge:{d:0,t:.6,e:'spring',from:{s:0}}},
 'letters':{label:'Letter by letter',panel:{d:0,t:.5,e:'expo',from:{sx:0}},bar:{d:.25,t:.6,e:'expo',from:{sx:0,sy:0}},frame:{d:0,t:.8,e:'inOut'},mark:{d:0,t:.6,e:'spring',from:{s:.4,o:0}},kicker:{d:0,t:.5,e:'out',from:{o:0}},main:{d:.05,t:.5,e:'back',from:{y:70,o:0},split:'char',st:.028},num:{d:.05,t:.5,e:'back',from:{y:70,o:0},split:'char',st:.05},sub:{d:.5,t:.6,e:'out',from:{o:0,y:40}},hl:{d:.35,t:.6,e:'expo',from:{sx:0}},badge:{d:0,t:.6,e:'spring',from:{s:0}}},
 'slide-bar':{label:'Slide from bar',panel:{d:.1,t:.55,e:'expo',from:{sx:0}},bar:{d:0,t:.4,e:'expo',from:{sy:0,sx:0}},frame:{d:0,t:.8,e:'inOut'},mark:{d:0,t:.6,e:'spring',from:{s:.4,o:0}},kicker:{d:.2,t:.55,e:'expo',from:{x:-105},mask:1},main:{d:.22,t:.65,e:'expo',from:{x:-105},mask:1},num:{d:.22,t:.65,e:'expo',from:{x:-105},mask:1},sub:{d:.34,t:.65,e:'expo',from:{x:-105},mask:1},hl:{d:.3,t:.6,e:'expo',from:{sx:0}},badge:{d:0,t:.6,e:'spring',from:{s:0}}},
 'panel-wipe':{label:'Panel wipe',panel:{d:0,t:.6,e:'expo',from:{sx:0}},panel2:{d:.12,t:.6,e:'expo',from:{sx:0}},bar:{d:.3,t:.5,e:'expo',from:{sy:0,sx:0}},frame:{d:0,t:.8,e:'inOut'},mark:{d:.2,t:.6,e:'spring',from:{s:.4,o:0}},kicker:{d:.25,t:.5,e:'expo',from:{y:115},mask:1},main:{d:.28,t:.6,e:'expo',from:{y:115},mask:1},num:{d:.28,t:.6,e:'expo',from:{y:115},mask:1},sub:{d:.4,t:.6,e:'expo',from:{y:115},mask:1},hl:{d:.3,t:.6,e:'expo',from:{sx:0}},badge:{d:.1,t:.6,e:'spring',from:{s:0}}},
 'spring-pop':{label:'Spring pop',all:{d:0,t:.7,e:'spring',from:{s:.72,o:0}},frame:{d:0,t:.8,e:'inOut'},sub:{d:.2,t:.5,e:'out',from:{o:0,y:30}},badge:{d:0,t:.6,e:'spring',from:{s:0}}},
 'type-on':{label:'Type on',panel:{d:0,t:.4,e:'expo',from:{o:0}},bar:{d:0,t:.4,e:'expo',from:{sx:0,sy:0}},frame:{d:0,t:.8,e:'inOut'},mark:{d:0,t:.4,e:'out',from:{o:0}},kicker:{d:0,t:.4,e:'out',from:{o:0}},main:{d:.1,t:.02,e:'linear',from:{o:0},split:'char',st:.045,caret:1},num:{d:.1,t:.02,e:'linear',from:{o:0},split:'char',st:.08},sub:{d:.2,t:.5,e:'out',from:{o:0},after:'main'},hl:{d:.3,t:.6,e:'expo',from:{sx:0}},badge:{d:0,t:.6,e:'spring',from:{s:0}}},
 'count-up':{label:'Number count',panel:{d:0,t:.55,e:'expo',from:{sx:0}},bar:{d:.1,t:.6,e:'expo',from:{sx:0,sy:0}},frame:{d:0,t:.8,e:'inOut'},mark:{d:0,t:.6,e:'spring',from:{s:.4,o:0}},kicker:{d:.05,t:.5,e:'out',from:{o:0,y:40}},main:{d:.1,t:.6,e:'expo',from:{o:0,y:40}},num:{d:.05,t:.5,e:'expo',from:{o:0,y:30},count:1.1},sub:{d:.45,t:.6,e:'out',from:{o:0,y:40}},hl:{d:.3,t:.6,e:'expo',from:{sx:0}},badge:{d:0,t:.6,e:'spring',from:{s:0}}},
 'fade':{label:'Soft fade',all:{d:0,t:.6,e:'out',from:{o:0,y:8}},frame:{d:0,t:.8,e:'inOut'}},
 'none':{label:'None'}
};
const motionList=Object.entries(motions).map(([k,m])=>[k,m.label]);

// Presets. layout decides which pieces exist and how they are arranged (see titles-v11.css).
const P=(id,category,name,layout,motion,text,subtitle,o={})=>({id,category,name,layout,motion,text,subtitle,kicker:'',font:'DM Sans',weight:700,size:30,align:'center',colour:'#ffffff',accent:'#2f8cff',background:'transparent',width:62,legibility:'strong',upper:false,...o});
const catalog=[
 P('t-clean','titles','Clean','stack','mask-up','A clearer way to work','Ideas, made simple',{kicker:'INTRODUCING',size:34}),
 P('t-editorial','titles','Editorial','rule','word-rise','Less, but better.','Make room for what matters',{font:'DM Serif Display',weight:400,size:42}),
 P('t-impact','titles','Impact','underbar','letters','Make it count','Your next big idea starts here',{font:'Oswald',weight:700,size:54,upper:true,accent:'#ffc233'}),
 P('t-highlight','titles','Highlighter','highlight','mask-up','Your next big idea','Starts here',{font:'Space Grotesk',weight:700,size:36,accent:'#2f8cff'}),
 P('l-bar','lower','Side bar','bar-left','slide-bar','Ananya Sharma','Product Lead · smallcase',{align:'left',size:26,width:46}),
 P('l-plate','lower','Name plate','plates','panel-wipe','Ananya Sharma','Product Lead',{align:'left',size:24,width:46,background:'#10161f',legibility:'none'}),
 P('l-glass','lower','Glass card','card','panel-wipe','Meet your team','The people behind the progress',{align:'left',size:24,width:46,background:'#0e1622cc',legibility:'none'}),
 P('l-minimal','lower','Minimal','topline','mask-up','Alex Chen','Product designer',{align:'left',size:24,width:40,font:'Space Grotesk',weight:600}),
 P('c-number','chapters','Chapter number','chapter','mask-up','Getting started','Set up in two minutes',{kicker:'01',size:28,align:'left',width:60,accent:'#ffc233'}),
 P('c-section','chapters','Section card','band','panel-wipe','The next chapter','A new way forward',{kicker:'PART TWO',size:34,background:'#2f6fe4',accent:'#ffffff',legibility:'none',width:70}),
 P('c-agenda','chapters','Agenda','bar-left','word-rise','What comes next','Plan  /  Build  /  Share',{kicker:'AGENDA',size:32,align:'left',width:56,font:'Space Grotesk'}),
 P('c-typed','chapters','Typed','stack','type-on','Let’s get started.','Step by step',{font:'DM Mono',weight:500,size:30,accent:'#7ee0a3'}),
 P('k-pointer','callouts','Pointer','pointer','spring-pop','Take a closer look','',{size:20,align:'left',width:30,background:'#ffffff',colour:'#10233a',accent:'#ffffff',legibility:'none',anchor:{x:68,y:62},x:30,y:34}),
 P('k-arrow','callouts','Arrow','arrow','fade','Start here','',{size:24,font:'Caveat',weight:700,width:22,accent:'#ffc233',anchor:{x:66,y:60},x:34,y:36}),
 P('k-box','callouts','Highlight box','shape-box','fade','','',{size:20,width:30,h:26,accent:'#ffc233',legibility:'none',x:50,y:50}),
 P('k-circle','callouts','Highlight circle','shape-circle','fade','','',{size:20,width:22,h:34,accent:'#ff5a5f',legibility:'none',x:50,y:50}),
 P('k-spotlight','callouts','Spotlight','shape-spot','fade','','',{size:20,width:34,h:40,dim:62,legibility:'none',x:50,y:50}),
 P('k-step','callouts','Step badge','step','mask-up','Import your clip','Drag a file onto the timeline',{kicker:'1',size:24,align:'left',width:48}),
 P('k-tip','callouts','Tip card','card','mask-up','A little tip','Keep it clear. Keep it simple.',{kicker:'TIP',size:22,align:'left',width:40,background:'#ffffff',colour:'#10233a',legibility:'none'}),
 P('k-pill','callouts','Highlight pill','pill','spring-pop','Good to know','',{size:22,width:34,background:'#2f6fe4',legibility:'none'}),
 P('q-pull','titles','Pull quote','quote','word-rise','Make it clear. Then make it count.','Ananya Sharma, Product Lead',{font:'DM Serif Display',weight:400,size:36,width:66,accent:'#ffc233'}),
 P('q-statement','titles','Statement','stack','word-rise','Progress starts with a conversation.','',{font:'Space Grotesk',weight:700,size:40,width:70}),
 P('q-card','lower','Testimonial card','card','panel-wipe','“A simpler way to get things done.”','Your team',{size:26,width:54,align:'left',background:'#ffffff',colour:'#10233a',legibility:'none',font:'DM Serif Display',weight:400}),
 P('n-metric','numbers','Key metric','metric','count-up','24%','Less time, more impact',{font:'Oswald',weight:700,size:64,accent:'#2f8cff'}),
 P('n-stat','numbers','Statistic card','metric-card','count-up','3×','Faster to share',{font:'Space Grotesk',weight:700,size:52,background:'#2f6fe4',accent:'#ffffff',legibility:'none',width:34}),
 P('n-milestone','numbers','Milestone','rule','count-up','1,000','Moments that matter',{font:'DM Serif Display',weight:400,size:60,accent:'#ffc233',numberMain:true})
];
const shapes=['shape-box','shape-circle','shape-spot'],geometric=['pointer','arrow'],numberLayouts=['metric','metric-card'];
const preset=id=>catalog.find(p=>p.id===id);

function create(id,start,end,ratio='16/9',context={}){
 const t=preset(id);if(!t)return null;const [w,h]=String(ratio).split('/').map(Number),portrait=w<h,lower=t.category==='lower';
 // Lower thirds sit inside the safe margin at the bottom left, and move up when captions use the bottom.
 const width=Math.min(88,portrait?Math.round(t.width*1.5):t.width),y=t.y??(lower?(context.captionsAtBottom?(portrait?62:68):(portrait?72:80)):50),x=t.x??(t.align==='left'&&!geometric.includes(t.layout)?6+width/2:50);
 return{id:'g'+root.crypto.randomUUID(),engine:'v11',kind:lower?'lower':'title',templateId:id,text:t.text,subtitle:t.subtitle,kicker:t.kicker,font:t.font,size:t.size,weight:t.weight,align:t.align,upper:!!t.upper,colour:t.colour,background:t.background,accent:t.accent,legibility:t.legibility,x,y,width,...(t.h?{h:t.h}:{}),...(t.dim?{dim:t.dim}:{}),...(t.anchor?{anchor:{...t.anchor}}:{}),start,end,animation:t.motion,animationSpeed:1,animateOut:true};
}
function createIcon(name,start,end){return{id:'g'+root.crypto.randomUUID(),engine:'v11',kind:'icon',icon:name,text:name.replace(/-/g,' '),iconStyle:'badge',entrance:'draw',loop:'none',size:28,colour:'#ffffff',accent:'#2f6fe4',x:50,y:50,width:14,start,end,animation:'spring-pop',animationSpeed:1,animateOut:true};}

// Overall position of an element in its life: entrance clock (seconds since start, speed applied) and exit factor.
function clock(e,time){
 const speed=e.animationSpeed||1,length=Math.max(.05,e.end-e.start),outLength=Math.min(.4/speed,length*.25);
 return{t:Math.max(0,(time-e.start)*speed),out:e.animateOut===false?1:ease.inOut(clamp((e.end-time)/outLength)),speed,length};
}
function spec(e,role){const m=motions[e.animation]||motions['mask-up'];return m[role]||m.all||null;}
// Progress (0–1, eased) of one unit of a piece. index/count describe its place among words or letters.
function unit(e,time,role,index=0,after=0){
 const s=typeof role==='object'?role:spec(e,role);if(!s)return{p:1,raw:1,s:null};const c=clock(e,time),raw=clamp((c.t-s.d-after-(s.st||0)*index)/s.t);
 return{p:(ease[s.e]||ease.out)(raw),raw,s};
}
// Seconds until every unit of a split piece has started and finished.
function span(e,role,count){const s=spec(e,role);return s?s.d+(s.st||0)*Math.max(0,count-1)+s.t:0;}
// CSS for a unit at progress p (transform values are relative offsets that reach zero at p = 1).
function style(s,p){
 if(!s||!s.from)return{opacity:1,transform:'none'};const f=s.from,k=1-p,parts=[];
 if(f.x||f.y)parts.push('translate('+((f.x||0)*k).toFixed(3)+'%,'+((f.y||0)*k).toFixed(3)+'%)');
 if(f.s!=null)parts.push('scale('+(f.s+(1-f.s)*p).toFixed(4)+')');
 if(f.sx!=null||f.sy!=null)parts.push('scale('+(f.sx!=null?f.sx+(1-f.sx)*p:1).toFixed(4)+','+(f.sy!=null?f.sy+(1-f.sy)*p:1).toFixed(4)+')');
 if(f.r)parts.push('rotate('+(f.r*k).toFixed(2)+'deg)');
 return{opacity:f.o!=null?clamp(f.o+(1-f.o)*Math.min(1,p)):1,transform:parts.join(' ')||'none'};
}
// Thousands separators, prefixes and decimals are kept while a number counts up.
function group(digits,indian){if(!indian)return digits.replace(/\B(?=(\d{3})+(?!\d))/g,',');const tail=digits.slice(-3),head=digits.slice(0,-3);return head?head.replace(/\B(?=(\d{2})+(?!\d))/g,',')+','+tail:tail;}
function countText(text,p){
 text=String(text);const m=text.match(/\d[\d,]*(?:\.\d+)?/);if(!m||clamp(p)>=1)return text;
 const raw=m[0],whole=raw.split('.')[0],decimals=(raw.split('.')[1]||'').length,target=Number(raw.replace(/,/g,''));if(!Number.isFinite(target))return text;
 let [int,frac]=(target*clamp(p)).toFixed(decimals).split('.');
 if(raw.includes(','))int=group(int,/^\d{1,2}(,\d{2})+,\d{3}$/.test(whole));else if(/^0\d/.test(whole))int=int.padStart(whole.length,'0');
 return text.slice(0,m.index)+int+(frac?'.'+frac:'')+text.slice(m.index+raw.length);
}
// Icon motion: entrance (draw-on, pop or fade) and an optional gentle loop while it is on screen.
function iconFrame(e,time,pathCount=1){
 const c=clock(e,time),enter=clamp(c.t/.7),pop=ease.spring(enter),local=Math.max(0,c.t-.7),two=Math.PI*2;
 let scale=1,x=0,y=0,rotate=0;
 if(e.loop==='pulse')scale=1+.06*Math.sin(local*two/1.4);else if(e.loop==='float')y=-6*Math.sin(local*two/2.4);else if(e.loop==='wiggle')rotate=7*Math.sin(local*two/1.1)*Math.exp(-((local%2.2)*1.6));else if(e.loop==='spin')rotate=(local*120)%360;
 const draw=i=>e.entrance==='draw'?ease.inOut(clamp((c.t-.12-i*.09)/.6)):1;
 return{opacity:c.out*(e.entrance==='none'?1:clamp(c.t/.18)),badge:e.entrance==='none'?1:pop,scale,x,y,rotate,draw,paths:pathCount};
}
const api={ease,fonts,categories,legibility,motions,motionList,catalog,shapes,geometric,numberLayouts,preset,create,createIcon,clock,spec,unit,span,style,countText,iconFrame,clamp};
if(typeof module==='object')module.exports=api;else root.titleModelV11=api;
})(globalThis);
