// GPUPixel browser adapter. Copyright 2021 PixPark (algorithms), Apache-2.0.
// See NOTICE.txt for pinned source files and the scope of this adaptation.
import {BEAUTY_VERTEX,BEAUTY_FRAGMENT,RESHAPE_FRAGMENT} from './shaders.js';
const VERT=`#version 300 es
in vec2 position;in vec2 inputTextureCoordinate;out vec2 textureCoordinate;
uniform float flipY;void main(){gl_Position=vec4(position,0.,1.);textureCoordinate=vec2(inputTextureCoordinate.x,mix(inputTextureCoordinate.y,1.-inputTextureCoordinate.y,flipY));}`;
const COPY=`#version 300 es
precision highp float;in vec2 textureCoordinate;out vec4 outColor;uniform sampler2D inputImageTexture;void main(){outColor=texture(inputImageTexture,textureCoordinate);}`;
// BoxMonoBlurFilter(radius=4, spacing=4): identical optimized offsets/weights.
const BLUR=`#version 300 es
precision highp float;in vec2 textureCoordinate;out vec4 outColor;uniform sampler2D inputImageTexture;uniform vec2 stepSize;
void main(){vec4 c=texture(inputImageTexture,textureCoordinate)/9.;c+=(texture(inputImageTexture,textureCoordinate+stepSize*1.5)+texture(inputImageTexture,textureCoordinate-stepSize*1.5))*2./9.;c+=(texture(inputImageTexture,textureCoordinate+stepSize*3.5)+texture(inputImageTexture,textureCoordinate-stepSize*3.5))*2./9.;outColor=c;}`;
const DIFF=`#version 300 es
precision highp float;in vec2 textureCoordinate;out vec4 outColor;uniform sampler2D inputImageTexture;uniform sampler2D inputImageTexture2;
void main(){vec3 d=(texture(inputImageTexture,textureCoordinate).rgb-texture(inputImageTexture2,textureCoordinate).rgb)*7.07;outColor=vec4(min(d*d,1.),1.);}`;

// Adapt MediaPipe's 478 points to only the 106-point entries used by GPUPixel.
export function gpupixelPoints(points){
  const out=new Float32Array(212);if(!points||points.length<956)return out;
  const set=(to,from)=>{out[to*2]=points[from*2];out[to*2+1]=points[from*2+1]};
  for(const [to,from]of [[3,127],[29,356],[7,234],[25,454],[10,172],[22,397],[14,150],[18,379],[16,152],[44,168],[45,1],[46,2],[49,13],[74,468],[77,473]])set(to,from);
  for(const [center,edge,a,b]of [[74,72,33,133],[77,75,263,362]]){
    const dx=points[a*2]-points[b*2],dy=points[a*2+1]-points[b*2+1];
    out[edge*2]=out[center*2]+dx*.18;out[edge*2+1]=out[center*2+1]+dy*.18;
  }return out;
}
export class Renderer{
  constructor(canvas){
    this.canvas=canvas;this.targets=[];this.programs=[];this.textures=[];this.disposed=false;
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false});
    if(!gl)throw Error('WebGL2 indisponível neste navegador.');this.gl=gl;
    try{
      this.copy=this.program(VERT,COPY);this.blur=this.program(VERT,BLUR);this.diff=this.program(VERT,DIFF);this.reshape=this.program(VERT,RESHAPE_FRAGMENT);this.beauty=this.program(BEAUTY_VERTEX,BEAUTY_FRAGMENT);
      this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,0,0,1,-1,1,0,-1,1,0,1,1,1,1,1]),gl.STATIC_DRAW);
      this.source=this.texture();this.luts=[];
      this.ready=Promise.all(['gray','origin','skin','light'].map(async name=>{const image=new Image();image.src=new URL('./lookup_'+name+'.png',import.meta.url).href;await image.decode();if(this.disposed)return null;const tex=this.texture();this.upload(tex,image);return tex})).then(tex=>{this.luts=tex});
    }catch(error){this.dispose();throw error}
  }
  program(vertex,fragment){const gl=this.gl,shaders=[];const id=gl.createProgram();try{for(const [type,src]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const sh=gl.createShader(type);shaders.push(sh);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error('Falha no filtro GPUPixel: '+gl.getShaderInfoLog(sh));gl.attachShader(id,sh)}gl.linkProgram(id);if(!gl.getProgramParameter(id,gl.LINK_STATUS))throw Error('Falha ao ligar o filtro GPUPixel: '+gl.getProgramInfoLog(id));const p={id,locations:new Map()};this.programs.push(p);return p}finally{for(const sh of shaders)gl.deleteShader(sh)}}
  texture(){const gl=this.gl,t=gl.createTexture();this.textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t}
  upload(tex,source){const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source)}
  location(p,name){if(!p.locations.has(name))p.locations.set(name,this.gl.getUniformLocation(p.id,name));return p.locations.get(name)}
  resize(w,h){if(w===this.width&&h===this.height)return;const gl=this.gl;for(const t of this.targets){gl.deleteTexture(t.tex);gl.deleteFramebuffer(t.fbo);this.textures.splice(this.textures.indexOf(t.tex),1)}this.targets=[];this.width=this.canvas.width=w;this.height=this.canvas.height=h;for(let i=0;i<6;i++){const tex=this.texture(),fbo=gl.createFramebuffer();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('A GPU não conseguiu preparar o vídeo.');this.targets.push({tex,fbo})}}
  pass(p,target,inputs,uniforms={},flip=false){const gl=this.gl;gl.useProgram(p.id);gl.bindFramebuffer(gl.FRAMEBUFFER,target?.fbo||null);gl.viewport(0,0,this.width,this.height);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);for(const [name,offset]of [['position',0],['inputTextureCoordinate',8]]){const loc=gl.getAttribLocation(p.id,name);if(loc>=0){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,16,offset)}}gl.uniform1f(this.location(p,'flipY'),flip?1:0);inputs.forEach(([name,t],i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(this.location(p,name),i)});for(const [name,v]of Object.entries(uniforms)){const loc=this.location(p,name);if(v instanceof Float32Array)gl.uniform1fv(loc,v);else if(Array.isArray(v))gl.uniform2fv(loc,v);else if(name==='hasFace')gl.uniform1i(loc,v);else gl.uniform1f(loc,v)}gl.drawArrays(gl.TRIANGLE_STRIP,0,4)}
  render(source,w,h,points,values){
    this.resize(w,h);this.upload(this.source,source);const gl=this.gl,face=!!points;
    if(!face||![values.smooth,values.bright,values.slim,values.eyes].some(v=>v>0)){this.pass(this.copy,null,[['inputImageTexture',this.source]],{},true);return}
    const [shape,temp,mean,diff,highTemp,variance]=this.targets;
    this.pass(this.reshape,shape,[['inputImageTexture',this.source]],{hasFace:1,'facePoints[0]':gpupixelPoints(points),aspectRatio:w/h,thinFaceDelta:values.slim/100*.12,bigEyeDelta:values.eyes/100*.18});
    this.pass(this.blur,temp,[['inputImageTexture',shape.tex]],{stepSize:[4/w,0]});this.pass(this.blur,mean,[['inputImageTexture',temp.tex]],{stepSize:[0,4/h]});
    this.pass(this.diff,diff,[['inputImageTexture',shape.tex],['inputImageTexture2',mean.tex]]);
    this.pass(this.blur,highTemp,[['inputImageTexture',diff.tex]],{stepSize:[4/w,0]});this.pass(this.blur,variance,[['inputImageTexture',highTemp.tex]],{stepSize:[0,4/h]});
    this.pass(this.beauty,null,[['inputImageTexture',shape.tex],['inputImageTexture2',mean.tex],['inputImageTexture3',variance.tex],['lookUpGray',this.luts[0]],['lookUpOrigin',this.luts[1]],['lookUpSkin',this.luts[2]],['lookUpCustom',this.luts[3]]],{widthOffset:1/w,heightOffset:1/h,blurAlpha:values.smooth/100,whiten:values.bright/100*.5,sharpen:values.smooth>0?.12:0},true);
    const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('A GPU interrompeu o filtro de câmera ('+error+').');
  }
  dispose(){if(this.disposed)return;this.disposed=true;const gl=this.gl;if(!gl)return;for(const t of this.targets)gl.deleteFramebuffer(t.fbo);for(const t of this.textures)gl.deleteTexture(t);for(const p of this.programs)gl.deleteProgram(p.id);if(this.buffer)gl.deleteBuffer(this.buffer);gl.getExtension('WEBGL_lose_context')?.loseContext()}
}
