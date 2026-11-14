(function(root){
'use strict';
const categories=[['titles','Titles'],['lower','Lower thirds'],['chapters','Chapters'],['callouts','Callouts'],['quotes','Quotes'],['numbers','Numbers']];
const data=[
 ['clarity','titles','Clarity','A clearer way to work','Ideas, made simple','reveal','clean'],
 ['editorial','titles','Editorial','Less, but better.','MAKE ROOM FOR WHAT MATTERS','rise','serif'],
 ['underline','titles','Underline','Your next big idea','STARTS HERE','underline','clean'],
 ['wordmark','titles','Word by word','Make every moment count','','words','bold'],
 ['nameplate','lower','Nameplate','Ananya Sharma','Product · smallcase','stagger','glass'],
 ['sideline','lower','Sideline','Meet your team','People behind the progress','slide','line'],
 ['minimal-name','lower','Minimal name','Alex Chen','Product designer','reveal','clean'],
 ['signature','lower','Signature','A fresh perspective','WITH YOUR TEAM','underline','serif'],
 ['chapter','chapters','Chapter marker','01','Getting started','wipe','chapter'],
 ['section','chapters','Section reveal','The next chapter','A NEW WAY FORWARD','reveal','blue'],
 ['agenda','chapters','Agenda','What comes next','PLAN  /  BUILD  /  SHARE','stagger','line'],
 ['type-on','chapters','Type on','Let’s get started.','STEP BY STEP','typewriter','mono'],
 ['tip','callouts','Helpful tip','A little tip','Keep it clear. Keep it simple.','rise','card'],
 ['pointer','callouts','Pointer','Take a closer look','RIGHT HERE ↗','slide','line'],
 ['pill','callouts','Highlight pill','Good to know','','pop','pill'],
 ['note','callouts','Quick note','One thing to remember','Small changes make a difference.','wipe','glass'],
 ['pullquote','quotes','Pull quote','“Make it clear.”','THEN MAKE IT COUNT','rise','serif'],
 ['statement','quotes','Statement','Progress starts with a conversation.','','words','bold'],
 ['testimonial','quotes','Testimonial','“A simpler way to get things done.”','YOUR TEAM','stagger','card'],
 ['focus-quote','quotes','Focus quote','Less noise. More meaning.','','underline','clean'],
 ['metric','numbers','Key metric','24%','LESS TIME, MORE IMPACT','count','metric'],
 ['stat-card','numbers','Statistic card','3×','FASTER TO SHARE','pop','blue'],
 ['steps','numbers','Step number','01','Make your first move','slide','chapter'],
 ['milestone','numbers','Milestone','100','MOMENTS THAT MATTER','count','serif']
];
const catalog=data.map(([id,category,name,text,subtitle,motion,design])=>({id,category,name,text,subtitle,motion,design}));
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>1-Math.pow(1-clamp(x),3);
function progress(e,time){const duration=Math.max(.05,e.end-e.start),speed=e.animationSpeed||1,span=Math.min(.65/speed,duration*.35),incoming=clamp((time-e.start)/span),outgoing=e.animateOut===false?1:clamp((e.end-time)/Math.min(.35/speed,duration*.25));return{p:ease(incoming),out:ease(outgoing),raw:incoming};}
function create(id,start,end,ratio='16/9'){const t=catalog.find(t=>t.id===id);if(!t)return null;const [w,h]=ratio.split('/').map(Number),portrait=w<h;return{id:'g'+crypto.randomUUID(),kind:t.category==='lower'?'lower':'title',templateId:id,text:t.text,subtitle:t.subtitle,font:['serif'].includes(t.design)?'Georgia':t.design==='mono'?'monospace':'DM Sans',size:t.design==='metric'?38:24,weight:t.design==='bold'?700:600,align:t.category==='lower'?'left':'center',colour:['glass','card'].includes(t.design)?'#143657':'#ffffff',background:['blue','pill'].includes(t.design)?'#1f7ae0':['glass','card'].includes(t.design)?'#ffffff':'transparent',accent:'#1f7ae0',x:50,y:t.category==='lower'?(portrait?65:72):50,width:portrait?82:65,start,end,animation:t.motion,animationSpeed:1,animateOut:true};}
// 0.9: number count understands prefixes, thousands separators and decimals ("$5M", "1,000", "₹2,50,000", "99.5%").
function group(digits,indian){if(!indian)return digits.replace(/\B(?=(\d{3})+(?!\d))/g,',');const tail=digits.slice(-3),head=digits.slice(0,-3);return head?head.replace(/\B(?=(\d{2})+(?!\d))/g,',')+','+tail:tail;}
function countText(text,p){
 text=String(text);const m=text.match(/\d[\d,]*(?:\.\d+)?/);if(!m||clamp(p)>=1)return text;
 const raw=m[0],whole=raw.split('.')[0],decimals=(raw.split('.')[1]||'').length,target=Number(raw.replace(/,/g,''));if(!Number.isFinite(target))return text;
 let [int,frac]=(target*clamp(p)).toFixed(decimals).split('.');
 if(raw.includes(','))int=group(int,/^\d{1,2}(,\d{2})+,\d{3}$/.test(whole));else if(/^0\d/.test(whole))int=int.padStart(whole.length,'0');
 return text.slice(0,m.index)+int+(frac?'.'+frac:'')+text.slice(m.index+raw.length);
}
const api={categories,catalog,progress,create,countText};if(typeof module==='object')module.exports=api;else root.titleModelV8=api;
})(globalThis);
