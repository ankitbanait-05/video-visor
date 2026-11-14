(function(root){
  function normalizeArea(rect, display){
    if(!rect || ![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)) throw Error('Draw a recording area first.');
    const x=Math.max(0,Math.min(display.width-64,Math.round(rect.x)));
    const y=Math.max(0,Math.min(display.height-64,Math.round(rect.y)));
    const width=Math.min(display.width-x,Math.round(rect.width));
    const height=Math.min(display.height-y,Math.round(rect.height));
    if(width<64||height<64)throw Error('Select an area at least 64 × 64 points.');
    return {x,y,width,height};
  }
  function pixelCrop(area,display,videoWidth,videoHeight){
    const a=normalizeArea(area,display),sx=videoWidth/display.width,sy=videoHeight/display.height;
    const x=Math.floor(a.x*sx/2)*2,y=Math.floor(a.y*sy/2)*2;
    const width=Math.max(2,Math.floor(Math.min(a.width*sx,videoWidth-x)/2)*2);
    const height=Math.max(2,Math.floor(Math.min(a.height*sy,videoHeight-y)/2)*2);
    return {x,y,width,height};
  }
  function cursorPoint(point,display,area){
    const a=area||{x:0,y:0,width:display.width,height:display.height};
    return {x:Math.max(0,Math.min(100,(point.x-display.x-a.x)/a.width*100)),y:Math.max(0,Math.min(100,(point.y-display.y-a.y)/a.height*100))};
  }
  class RecordingClock{
    constructor(now=()=>Date.now()){this.now=now;this.started=0;this.pausedAt=null;this.pausedTime=0;}
    start(){this.started=this.now();this.pausedAt=null;this.pausedTime=0;}
    pause(){if(this.pausedAt===null)this.pausedAt=this.now();}
    resume(){if(this.pausedAt!==null){this.pausedTime+=this.now()-this.pausedAt;this.pausedAt=null;}}
    seconds(){return Math.max(0,((this.pausedAt??this.now())-this.started-this.pausedTime)/1000);}
  }
  const api={normalizeArea,pixelCrop,cursorPoint,RecordingClock};
  if(typeof module==='object')module.exports=api;else root.recordingGeometry=api;
})(globalThis);
