(function(){
var v=document.getElementById('vsom');if(!v)return;
var de=document.documentElement;de.classList.add('vsom-on');
var cv=document.getElementById('vsomBolt'),cx=cv.getContext('2d'),fl=document.getElementById('vsomFlash'),zeus=document.getElementById('vsomZeus');
var T=[],done=false,gone=false,dpr=Math.min(window.devicePixelRatio||1,2),W,H;
function size(){W=innerWidth;H=innerHeight;cv.width=W*dpr;cv.height=H*dpr;cx.setTransform(dpr,0,0,dpr,0,0)}
size();addEventListener('resize',size);
function at(ms,f){T.push(setTimeout(f,ms))}
function add(c){v.classList.add(c)}function rm(c){v.classList.remove(c)}
function fist(){var r=zeus.getBoundingClientRect();return{x:r.left+r.width*.37,y:r.top+r.height*.114}}
// midpoint-displacement lightning with branches
function seg(x1,y1,x2,y2,d,out){if(d<5){out.push([x2,y2]);return}var mx=(x1+x2)/2+(Math.random()-.5)*d,my=(y1+y2)/2+(Math.random()-.5)*d*.35;seg(x1,y1,mx,my,d/2,out);seg(mx,my,x2,y2,d/2,out)}
function path(x1,y1,x2,y2,d){var p=[[x1,y1]];seg(x1,y1,x2,y2,d,p);return p}
function bolt(x1,y1,x2,y2,w,depth){var d=Math.hypot(x2-x1,y2-y1)*.22,p=path(x1,y1,x2,y2,d),b=[{p:p,w:w}];
 if(depth>0)for(var i=0;i<3+Math.random()*3;i++){var k=p[Math.floor(p.length*(.15+Math.random()*.6))],a=Math.atan2(y2-y1,x2-x1)+(Math.random()-.5)*1.6,L=Math.hypot(x2-x1,y2-y1)*(.15+Math.random()*.3);b=b.concat(bolt(k[0],k[1],k[0]+Math.cos(a)*L,k[1]+Math.sin(a)*L,w*.45,depth-1))}return b}
function draw(bs,alpha){cx.clearRect(0,0,W,H);cx.globalCompositeOperation='lighter';cx.lineCap=cx.lineJoin='round';
 bs.forEach(function(b){[[b.w*7,'rgba(90,150,255,'+.10*alpha+')',40],[b.w*3,'rgba(150,210,255,'+.35*alpha+')',20],[b.w,'rgba(255,255,255,'+alpha+')',8]].forEach(function(s){cx.beginPath();cx.moveTo(b.p[0][0],b.p[0][1]);for(var i=1;i<b.p.length;i++)cx.lineTo(b.p[i][0],b.p[i][1]);cx.lineWidth=s[0];cx.strokeStyle=s[1];cx.shadowBlur=s[2];cx.shadowColor='rgba(140,200,255,'+alpha+')';cx.stroke()})});cx.globalCompositeOperation='source-over'}
function sparks(){if(done||!v.classList.contains('charge'))return;var f=fist(),bs=[];for(var i=0;i<3;i++){var a=Math.random()*6.28,L=20+Math.random()*50;bs=bs.concat(bolt(f.x,f.y,f.x+Math.cos(a)*L,f.y+Math.sin(a)*L,1.2,0))}draw(bs,.9);requestAnimationFrame(function(){setTimeout(sparks,60)})}
var G=[].slice.call(v.querySelectorAll('.vsom-glow'));
function cloud(n){for(var i=0;i<(n||1);i++){var g=G[Math.floor(Math.random()*G.length)];(function(g){var k=0,m=1+Math.floor(Math.random()*3);(function p(){g.classList.add('on');setTimeout(function(){g.classList.remove('on');if(++k<m)setTimeout(p,60+Math.random()*120)},50+Math.random()*90)})()})(g)}}
function clouds(){if(!document.body.contains(v)||gone)return;cloud(1);T2.push(setTimeout(clouds,700+Math.random()*1800))}
var T2=[];
function skyFlick(){cloud(2);add('sky');setTimeout(function(){rm('sky')},70);setTimeout(function(){add('sky')},140);setTimeout(function(){rm('sky')},200)}
function strike(){rm('charge');var f=fist(),tx=W*(.45+Math.random()*.1),ty=H*1.02,main=bolt(f.x,f.y,tx,ty,3.4,2),up=bolt(f.x,f.y,f.x+W*.35,-20,2.6,1),all=main.concat(up);
 fl.classList.remove('go');void fl.offsetWidth;fl.classList.add('go');add('shake');if(navigator.vibrate)try{navigator.vibrate([40,30,90])}catch(e){}
 var t0=performance.now(),flick=[0,90,160,260];
 (function fr(){var t=performance.now()-t0;if(t>620){cx.clearRect(0,0,W,H);return}
  var a=t<60?1:t<120?.25:t<170?1:t<240?.3:Math.max(0,1-(t-240)/380);if(t>150&&t<170)all=main.concat(bolt(f.x,f.y,tx+(Math.random()-.5)*60,ty,3,1));draw(all,a);requestAnimationFrame(fr)})();
 setTimeout(function(){rm('shake')},520)}
function ready(){if(done)return;done=true;if(!T2.length)clouds();T.forEach(clearTimeout);rm('charge');rm('sky');cx.clearRect(0,0,W,H);add('rise');add('eyes');add('ready');ambient()}
function ambient(){T.push(setTimeout(function(){if(!document.body.contains(v)||v.classList.contains('out'))return;skyFlick();ambient()},4000+Math.random()*4000))}
var snd=new Audio('/thunder.mp3');snd.preload='auto';snd.volume=1;
function go(){if(gone)return;gone=true;T.forEach(clearTimeout);T2.forEach(clearTimeout);cloud(3);try{snd.currentTime=0;var pr=snd.play();if(pr&&pr.catch)pr.catch(function(){})}catch(e){}
 strike();setTimeout(function(){v.classList.add('out');de.classList.remove('vsom-on');setTimeout(function(){v.remove()},750)},420)}
document.getElementById('vsomGo').addEventListener('click',function(e){e.stopPropagation();go()});
v.addEventListener('click',function(){if(!done){ready()}});
if(matchMedia('(prefers-reduced-motion: reduce)').matches){ready();return}
var img=zeus.querySelector('img');
function run(){
 clouds();
 at(250,skyFlick);
 at(700,function(){add('rise')});
 at(1100,skyFlick);
 at(1500,function(){add('eyes')});
 at(2200,function(){add('charge');sparks()});
 at(3000,strike);
 at(3500,ready);
}
if(img.complete)run();else{img.addEventListener('load',run);img.addEventListener('error',ready);T.push(setTimeout(function(){if(!img.complete)ready()},4000))}
})();
