"use strict";(()=>{var Nt=Object.defineProperty;var $e=e=>{throw TypeError(e)};var jt=(e,t)=>{for(var r in t)Nt(e,r,{get:t[r],enumerable:!0})};var We=(e,t,r)=>t.has(e)||$e("Cannot "+r);var i=(e,t,r)=>(We(e,t,"read from private field"),r?r.call(e):t.get(e)),c=(e,t,r)=>t.has(e)?$e("Cannot add the same private member more than once"):t instanceof WeakSet?t.add(e):t.set(e,r),f=(e,t,r,n)=>(We(e,t,"write to private field"),n?n.call(e,r):t.set(e,r),r);var we={};jt(we,{ProgressTypes:()=>H});var H={BAR:"bar",RADIAL:"radial",PERCENTAGE:"percentage"};var ue={"Drop a video file here to upload":"Drop a video file here to upload",or:"or","Upload complete!":"Upload complete!",Retry:"Retry","Pausing...":"Pausing...",Resume:"Resume",Pause:"Pause","Upload a video":"Upload a video","No url or endpoint specified - cannot handle upload":"No url or endpoint specified - cannot handle upload"};var qe={"Drop a video file here to upload":"Arrastra un archivo de video aqu\xED para subir",or:"o","Upload complete!":"\xA1Subida completada!",Retry:"Reintentar","Pausing...":"Pausando...",Resume:"Reanudar",Pause:"Pausar","Upload a video":"Subir un video","No url or endpoint specified - cannot handle upload":"No se especific\xF3 URL o endpoint - no se puede manejar la subida"};var Xe={"Drop a video file here to upload":"D\xE9posez un fichier vid\xE9o ici pour le t\xE9l\xE9charger",or:"ou","Upload complete!":"T\xE9l\xE9chargement termin\xE9!",Retry:"R\xE9essayer","Pausing...":"En pause...",Resume:"Reprendre",Pause:"Pause","Upload a video":"T\xE9l\xE9charger une vid\xE9o","No url or endpoint specified - cannot handle upload":"Aucune URL ou point de terminaison sp\xE9cifi\xE9 - impossible de g\xE9rer le t\xE9l\xE9chargement"};var Ge={"Drop a video file here to upload":"Legen Sie hier eine Videodatei zum Hochladen ab",or:"oder","Upload complete!":"Upload abgeschlossen!",Retry:"Wiederholen","Pausing...":"Pausiere...",Resume:"Fortsetzen",Pause:"Pausieren","Upload a video":"Video hochladen","No url or endpoint specified - cannot handle upload":"Keine URL oder Endpunkt angegeben - Upload kann nicht verarbeitet werden"};var Ve={"Drop a video file here to upload":"Arraste um arquivo de v\xEDdeo aqui para fazer o upload",or:"ou","Upload complete!":"Upload completo!",Retry:"Tentar novamente","Pausing...":"Pausando...",Resume:"Retomar",Pause:"Pausar","Upload a video":"Fazer upload de um v\xEDdeo","No url or endpoint specified - cannot handle upload":"Nenhum URL ou endpoint especificado - n\xE3o \xE9 poss\xEDvel processar o upload"};var Ke={"Drop a video file here to upload":"Trascina qui un file video per caricarlo",or:"o","Upload complete!":"Caricamento completato!",Retry:"Riprova","Pausing...":"In pausa...",Resume:"Riprendi",Pause:"Pausa","Upload a video":"Carica un video","No url or endpoint specified - cannot handle upload":"Nessun URL o endpoint specificato - impossibile gestire il caricamento"};var Ye={"Drop a video file here to upload":"\u5C06\u89C6\u9891\u6587\u4EF6\u62D6\u653E\u5230\u6B64\u5904\u4EE5\u4E0A\u4F20",or:"\u6216","Upload complete!":"\u4E0A\u4F20\u5B8C\u6210\uFF01",Retry:"\u91CD\u8BD5","Pausing...":"\u6682\u505C...",Resume:"\u7EE7\u7EED",Pause:"\u6682\u505C","Upload a video":"\u4E0A\u4F20\u89C6\u9891","No url or endpoint specified - cannot handle upload":"\u672A\u6307\u5B9A URL \u6216 endpoint - \u65E0\u6CD5\u5904\u7406\u4E0A\u4F20"};var $t={en:ue,es:qe,fr:Xe,de:Ge,pt:Ve,it:Ke,zh:Ye};var Wt=()=>typeof globalThis.navigator=="undefined"||!globalThis.navigator.language?"en":globalThis.navigator.language.split("-")[0],Ze=["en","es","fr","de","pt","it","zh"],qt=e=>{if(e&&Ze.includes(e))return e;let t=Wt();return Ze.includes(t)?t:"en"},v=(e,t)=>{let r=qt(t);return($t[r]||ue)[e]||ue[e]};var N=class{addEventListener(){}removeEventListener(){}dispatchEvent(t){return!0}};if(typeof DocumentFragment=="undefined"){class e extends N{}globalThis.DocumentFragment=e}var Y=class extends N{},Ae=class extends N{},Xt={get(e){},define(e,t,r){},getName(e){return null},upgrade(e){},whenDefined(e){return Promise.resolve(Y)}},Z,Re=class{constructor(t,r={}){c(this,Z);f(this,Z,r==null?void 0:r.detail)}get detail(){return i(this,Z)}initCustomEvent(){}};Z=new WeakMap;function Gt(e,t){return new Y}var Je={document:{createElement:Gt},DocumentFragment,customElements:Xt,CustomEvent:Re,EventTarget:N,HTMLElement:Y,HTMLVideoElement:Ae},Qe=typeof window=="undefined"||typeof globalThis.customElements=="undefined",d=Qe?Je:globalThis,C=Qe?Je.document:globalThis.document;var Vt=Object.create,dt=Object.defineProperty,Kt=Object.getOwnPropertyDescriptor,pt=Object.getOwnPropertyNames,Yt=Object.getPrototypeOf,Zt=Object.prototype.hasOwnProperty,ee=(e,t)=>function(){return t||(0,e[pt(e)[0]])((t={exports:{}}).exports,t),t.exports},Jt=(e,t,r,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let s of pt(t))!Zt.call(e,s)&&s!==r&&dt(e,s,{get:()=>t[s],enumerable:!(n=Kt(t,s))||n.enumerable});return e},Qt=(e,t,r)=>(r=e!=null?Vt(Yt(e)):{},Jt(t||!e||!e.__esModule?dt(r,"default",{value:e,enumerable:!0}):r,e)),er=ee({"node_modules/global/window.js"(e,t){var r;typeof window!="undefined"?r=window:typeof global!="undefined"?r=global:typeof self!="undefined"?r=self:r={},t.exports=r}}),tr=ee({"node_modules/is-function/index.js"(e,t){t.exports=n;var r=Object.prototype.toString;function n(s){if(!s)return!1;var o=r.call(s);return o==="[object Function]"||typeof s=="function"&&o!=="[object RegExp]"||typeof window!="undefined"&&(s===window.setTimeout||s===window.alert||s===window.confirm||s===window.prompt)}}}),rr=ee({"node_modules/parse-headers/parse-headers.js"(e,t){var r=function(s){return s.replace(/^\s+|\s+$/g,"")},n=function(s){return Object.prototype.toString.call(s)==="[object Array]"};t.exports=function(s){if(!s)return{};for(var o={},a=r(s).split(`
`),u=0;u<a.length;u++){var h=a[u],y=h.indexOf(":"),E=r(h.slice(0,y)).toLowerCase(),w=r(h.slice(y+1));typeof o[E]=="undefined"?o[E]=w:n(o[E])?o[E].push(w):o[E]=[o[E],w]}return o}}}),nr=ee({"node_modules/xtend/immutable.js"(e,t){t.exports=n;var r=Object.prototype.hasOwnProperty;function n(){for(var s={},o=0;o<arguments.length;o++){var a=arguments[o];for(var u in a)r.call(a,u)&&(s[u]=a[u])}return s}}}),sr=ee({"node_modules/xhr/index.js"(e,t){"use strict";var r=er(),n=tr(),s=rr(),o=nr();t.exports=y,t.exports.default=y,y.XMLHttpRequest=r.XMLHttpRequest||ve,y.XDomainRequest="withCredentials"in new y.XMLHttpRequest?y.XMLHttpRequest:r.XDomainRequest,a(["get","put","post","patch","head","delete"],function(l){y[l==="delete"?"del":l]=function(k,T,B){return T=h(k,T,B),T.method=l.toUpperCase(),E(T)}});function a(l,k){for(var T=0;T<l.length;T++)k(l[T])}function u(l){for(var k in l)if(l.hasOwnProperty(k))return!1;return!0}function h(l,k,T){var B=l;return n(k)?(T=k,typeof l=="string"&&(B={uri:l})):B=o(k,{uri:l}),B.callback=T,B}function y(l,k,T){return k=h(l,k,T),E(k)}function E(l){if(typeof l.callback=="undefined")throw new Error("callback argument missing");var k=!1,T=function(F,le,Ht){k||(k=!0,l.callback(F,le,Ht))};function B(){p.readyState===4&&setTimeout(He,0)}function Ft(){var g=void 0;if(p.response?g=p.response:g=p.responseText||w(p),Ne)try{g=JSON.parse(g)}catch{}return g}function Ce(g){return clearTimeout(Se),g instanceof Error||(g=new Error(""+(g||"Unknown XMLHttpRequest Error"))),g.statusCode=0,T(g,je)}function He(){if(!ae){var g;clearTimeout(Se),l.useXDR&&p.status===void 0?g=200:g=p.status===1223?204:p.status;var F=je,le=null;return g!==0?(F={body:Ft(),statusCode:g,method:K,headers:{},url:ke,rawRequest:p},p.getAllResponseHeaders&&(F.headers=s(p.getAllResponseHeaders()))):le=new Error("Internal XMLHttpRequest Error"),T(le,F,F.body)}}var p=l.xhr||null;p||(l.cors||l.useXDR?p=new y.XDomainRequest:p=new y.XMLHttpRequest);var oe,ae,ke=p.url=l.uri||l.url,K=p.method=l.method||"GET",xe=l.body||l.data,U=p.headers=l.headers||{},Te=!!l.sync,Ne=!1,Se,je={body:void 0,headers:{},statusCode:0,method:K,url:ke,rawRequest:p};if("json"in l&&l.json!==!1&&(Ne=!0,U.accept||U.Accept||(U.Accept="application/json"),K!=="GET"&&K!=="HEAD"&&(U["content-type"]||U["Content-Type"]||(U["Content-Type"]="application/json"),xe=JSON.stringify(l.json===!0?xe:l.json))),p.onreadystatechange=B,p.onload=He,p.onerror=Ce,p.onprogress=function(){},p.onabort=function(){ae=!0},p.ontimeout=Ce,p.open(K,ke,!Te,l.username,l.password),Te||(p.withCredentials=!!l.withCredentials),!Te&&l.timeout>0&&(Se=setTimeout(function(){if(!ae){ae=!0,p.abort("timeout");var g=new Error("XMLHttpRequest timeout");g.code="ETIMEDOUT",Ce(g)}},l.timeout)),p.setRequestHeader)for(oe in U)U.hasOwnProperty(oe)&&p.setRequestHeader(oe,U[oe]);else if(l.headers&&!u(l.headers))throw new Error("Headers cannot be set on an XDomainRequest object");return"responseType"in l&&(p.responseType=l.responseType),"beforeSend"in l&&typeof l.beforeSend=="function"&&l.beforeSend(p),p.send(xe||null),p}function w(l){try{if(l.responseType==="document")return l.responseXML;var k=l.responseXML&&l.responseXML.documentElement.nodeName==="parsererror";if(l.responseType===""&&!k)return l.responseXML}catch{}return null}function ve(){}}});function Ue(e,t,...r){if(!e)throw new TypeError(ht(t,r))}function ht(e,t){let r=0;return e.replace(/%[os]/gu,()=>ct(t[r++]))}function ct(e){return typeof e!="object"||e===null?String(e):Object.prototype.toString.call(e)}var et;function ir(e){try{let t=e instanceof Error?e:new Error(ct(e));if(et){et(t);return}if(typeof dispatchEvent=="function"&&typeof ErrorEvent=="function")dispatchEvent(new ErrorEvent("error",{error:t,message:t.message}));else if(typeof process!="undefined"&&typeof process.emit=="function"){process.emit("uncaughtException",t);return}console.error(t)}catch{}}var L=typeof window!="undefined"?window:typeof self!="undefined"?self:typeof global!="undefined"?global:typeof globalThis!="undefined"?globalThis:void 0,tt,D=class{constructor(e,t){this.code=e,this.message=t}warn(...e){var t;try{if(tt){tt({...this,args:e});return}let r=((t=new Error().stack)!==null&&t!==void 0?t:"").replace(/^(?:.+?\n){2}/gu,`
`);console.warn(this.message,...e,r)}catch{}}},or=new D("W01","Unable to initialize event under dispatching."),ar=new D("W02","Assigning any falsy value to 'cancelBubble' property has no effect."),lr=new D("W03","Assigning any truthy value to 'returnValue' property has no effect."),ur=new D("W04","Unable to preventDefault on non-cancelable events."),dr=new D("W05","Unable to preventDefault inside passive event listener invocation."),pr=new D("W06","An event listener wasn't added because it has been added already: %o, %o"),Le=new D("W07","The %o option value was abandoned because the event listener wasn't added as duplicated."),rt=new D("W08","The 'callback' argument must be a function or an object that has 'handleEvent' method: %o"),on=new D("W09","Event attribute handler must be a function: %o"),O=class{static get NONE(){return nt}static get CAPTURING_PHASE(){return st}static get AT_TARGET(){return it}static get BUBBLING_PHASE(){return ot}constructor(e,t){Object.defineProperty(this,"isTrusted",{value:!1,enumerable:!0});let r=t!=null?t:{};ze.set(this,{type:String(e),bubbles:!!r.bubbles,cancelable:!!r.cancelable,composed:!!r.composed,target:null,currentTarget:null,stopPropagationFlag:!1,stopImmediatePropagationFlag:!1,canceledFlag:!1,inPassiveListenerFlag:!1,dispatchFlag:!1,timeStamp:Date.now()})}get type(){return b(this).type}get target(){return b(this).target}get srcElement(){return b(this).target}get currentTarget(){return b(this).currentTarget}composedPath(){let e=b(this).currentTarget;return e?[e]:[]}get NONE(){return nt}get CAPTURING_PHASE(){return st}get AT_TARGET(){return it}get BUBBLING_PHASE(){return ot}get eventPhase(){return b(this).dispatchFlag?2:0}stopPropagation(){b(this).stopPropagationFlag=!0}get cancelBubble(){return b(this).stopPropagationFlag}set cancelBubble(e){e?b(this).stopPropagationFlag=!0:ar.warn()}stopImmediatePropagation(){let e=b(this);e.stopPropagationFlag=e.stopImmediatePropagationFlag=!0}get bubbles(){return b(this).bubbles}get cancelable(){return b(this).cancelable}get returnValue(){return!b(this).canceledFlag}set returnValue(e){e?lr.warn():at(b(this))}preventDefault(){at(b(this))}get defaultPrevented(){return b(this).canceledFlag}get composed(){return b(this).composed}get isTrusted(){return!1}get timeStamp(){return b(this).timeStamp}initEvent(e,t=!1,r=!1){let n=b(this);if(n.dispatchFlag){or.warn();return}ze.set(this,{...n,type:String(e),bubbles:!!t,cancelable:!!r,target:null,currentTarget:null,stopPropagationFlag:!1,stopImmediatePropagationFlag:!1,canceledFlag:!1})}},nt=0,st=1,it=2,ot=3,ze=new WeakMap;function b(e,t="this"){let r=ze.get(e);return Ue(r!=null,"'%s' must be an object that Event constructor created, but got another one: %o",t,e),r}function at(e){if(e.inPassiveListenerFlag){dr.warn();return}if(!e.cancelable){ur.warn();return}e.canceledFlag=!0}Object.defineProperty(O,"NONE",{enumerable:!0});Object.defineProperty(O,"CAPTURING_PHASE",{enumerable:!0});Object.defineProperty(O,"AT_TARGET",{enumerable:!0});Object.defineProperty(O,"BUBBLING_PHASE",{enumerable:!0});var Me=Object.getOwnPropertyNames(O.prototype);for(let e=0;e<Me.length;++e)Me[e]!=="constructor"&&Object.defineProperty(O.prototype,Me[e],{enumerable:!0});typeof L!="undefined"&&typeof L.Event!="undefined"&&Object.setPrototypeOf(O.prototype,L.Event.prototype);function hr(e){return L.DOMException?new L.DOMException(e,"InvalidStateError"):(j==null&&(j=class ft extends Error{constructor(r){super(r),Error.captureStackTrace&&Error.captureStackTrace(this,ft)}get code(){return 11}get name(){return"InvalidStateError"}},Object.defineProperties(j.prototype,{code:{enumerable:!0},name:{enumerable:!0}}),ut(j),ut(j.prototype)),new j(e))}var j,lt={INDEX_SIZE_ERR:1,DOMSTRING_SIZE_ERR:2,HIERARCHY_REQUEST_ERR:3,WRONG_DOCUMENT_ERR:4,INVALID_CHARACTER_ERR:5,NO_DATA_ALLOWED_ERR:6,NO_MODIFICATION_ALLOWED_ERR:7,NOT_FOUND_ERR:8,NOT_SUPPORTED_ERR:9,INUSE_ATTRIBUTE_ERR:10,INVALID_STATE_ERR:11,SYNTAX_ERR:12,INVALID_MODIFICATION_ERR:13,NAMESPACE_ERR:14,INVALID_ACCESS_ERR:15,VALIDATION_ERR:16,TYPE_MISMATCH_ERR:17,SECURITY_ERR:18,NETWORK_ERR:19,ABORT_ERR:20,URL_MISMATCH_ERR:21,QUOTA_EXCEEDED_ERR:22,TIMEOUT_ERR:23,INVALID_NODE_TYPE_ERR:24,DATA_CLONE_ERR:25};function ut(e){let t=Object.keys(lt);for(let r=0;r<t.length;++r){let n=t[r],s=lt[n];Object.defineProperty(e,n,{get(){return s},configurable:!0,enumerable:!0})}}var pe=class extends O{static wrap(e){return new(gt(e))(e)}constructor(e){super(e.type,{bubbles:e.bubbles,cancelable:e.cancelable,composed:e.composed}),e.cancelBubble&&super.stopPropagation(),e.defaultPrevented&&super.preventDefault(),mt.set(this,{original:e});let t=Object.keys(e);for(let r=0;r<t.length;++r){let n=t[r];n in this||Object.defineProperty(this,n,bt(e,n))}}stopPropagation(){super.stopPropagation();let{original:e}=I(this);"stopPropagation"in e&&e.stopPropagation()}get cancelBubble(){return super.cancelBubble}set cancelBubble(e){super.cancelBubble=e;let{original:t}=I(this);"cancelBubble"in t&&(t.cancelBubble=e)}stopImmediatePropagation(){super.stopImmediatePropagation();let{original:e}=I(this);"stopImmediatePropagation"in e&&e.stopImmediatePropagation()}get returnValue(){return super.returnValue}set returnValue(e){super.returnValue=e;let{original:t}=I(this);"returnValue"in t&&(t.returnValue=e)}preventDefault(){super.preventDefault();let{original:e}=I(this);"preventDefault"in e&&e.preventDefault()}get timeStamp(){let{original:e}=I(this);return"timeStamp"in e?e.timeStamp:super.timeStamp}},mt=new WeakMap;function I(e){let t=mt.get(e);return Ue(t!=null,"'this' is expected an Event object, but got",e),t}var de=new WeakMap;de.set(Object.prototype,pe);typeof L!="undefined"&&typeof L.Event!="undefined"&&de.set(L.Event.prototype,pe);function gt(e){let t=Object.getPrototypeOf(e);if(t==null)return pe;let r=de.get(t);return r==null&&(r=cr(gt(t),t),de.set(t,r)),r}function cr(e,t){class r extends e{}let n=Object.keys(t);for(let s=0;s<n.length;++s)Object.defineProperty(r.prototype,n[s],bt(t,n[s]));return r}function bt(e,t){let r=Object.getOwnPropertyDescriptor(e,t);return{get(){let n=I(this).original,s=n[t];return typeof s=="function"?s.bind(n):s},set(n){let s=I(this).original;s[t]=n},configurable:r.configurable,enumerable:r.enumerable}}function fr(e,t,r,n,s,o){return{callback:e,flags:(t?1:0)|(r?2:0)|(n?4:0),signal:s,signalListener:o}}function mr(e){e.flags|=8}function yt(e){return(e.flags&1)===1}function Et(e){return(e.flags&2)===2}function vt(e){return(e.flags&4)===4}function gr(e){return(e.flags&8)===8}function br({callback:e},t,r){try{typeof e=="function"?e.call(t,r):typeof e.handleEvent=="function"&&e.handleEvent(r)}catch(n){ir(n)}}function Ct({listeners:e},t,r){for(let n=0;n<e.length;++n)if(e[n].callback===t&&yt(e[n])===r)return n;return-1}function yr(e,t,r,n,s,o){let a;o&&(a=kt.bind(null,e,t,r),o.addEventListener("abort",a));let u=fr(t,r,n,s,o,a);return e.cow?(e.cow=!1,e.listeners=[...e.listeners,u]):e.listeners.push(u),u}function kt(e,t,r){let n=Ct(e,t,r);return n!==-1?xt(e,n):!1}function xt(e,t,r=!1){let n=e.listeners[t];return mr(n),n.signal&&n.signal.removeEventListener("abort",n.signalListener),e.cow&&!r?(e.cow=!1,e.listeners=e.listeners.filter((s,o)=>o!==t),!1):(e.listeners.splice(t,1),!0)}function Er(){return Object.create(null)}function vr(e,t){var r;return(r=e[t])!==null&&r!==void 0?r:e[t]={attrCallback:void 0,attrListener:void 0,cow:!1,listeners:[]}}var he=class{constructor(){Tt.set(this,Er())}addEventListener(e,t,r){let n=_e(this),{callback:s,capture:o,once:a,passive:u,signal:h,type:y}=Cr(e,t,r);if(s==null||h!=null&&h.aborted)return;let E=vr(n,y),w=Ct(E,s,o);if(w!==-1){xr(E.listeners[w],u,a,h);return}yr(E,s,o,u,a,h)}removeEventListener(e,t,r){let n=_e(this),{callback:s,capture:o,type:a}=kr(e,t,r),u=n[a];s!=null&&u&&kt(u,s,o)}dispatchEvent(e){let t=_e(this)[String(e.type)];if(t==null)return!0;let r=e instanceof O?e:pe.wrap(e),n=b(r,"event");if(n.dispatchFlag)throw hr("This event has been in dispatching.");if(n.dispatchFlag=!0,n.target=n.currentTarget=this,!n.stopPropagationFlag){let{cow:s,listeners:o}=t;t.cow=!0;for(let a=0;a<o.length;++a){let u=o[a];if(!gr(u)&&(vt(u)&&xt(t,a,!s)&&(a-=1),n.inPassiveListenerFlag=Et(u),br(u,this,r),n.inPassiveListenerFlag=!1,n.stopImmediatePropagationFlag))break}s||(t.cow=!1)}return n.target=null,n.currentTarget=null,n.stopImmediatePropagationFlag=!1,n.stopPropagationFlag=!1,n.dispatchFlag=!1,!n.canceledFlag}},Tt=new WeakMap;function _e(e,t="this"){let r=Tt.get(e);return Ue(r!=null,"'%s' must be an object that EventTarget constructor created, but got another one: %o",t,e),r}function Cr(e,t,r){var n;return St(t),typeof r=="object"&&r!==null?{type:String(e),callback:t!=null?t:void 0,capture:!!r.capture,passive:!!r.passive,once:!!r.once,signal:(n=r.signal)!==null&&n!==void 0?n:void 0}:{type:String(e),callback:t!=null?t:void 0,capture:!!r,passive:!1,once:!1,signal:void 0}}function kr(e,t,r){return St(t),typeof r=="object"&&r!==null?{type:String(e),callback:t!=null?t:void 0,capture:!!r.capture}:{type:String(e),callback:t!=null?t:void 0,capture:!!r}}function St(e){if(!(typeof e=="function"||typeof e=="object"&&e!==null&&typeof e.handleEvent=="function")){if(e==null||typeof e=="object"){rt.warn(e);return}throw new TypeError(ht(rt.message,[e]))}}function xr(e,t,r,n){pr.warn(yt(e)?"capture":"bubble",e.callback),Et(e)!==t&&Le.warn("passive"),vt(e)!==r&&Le.warn("once"),e.signal!==n&&Le.warn("signal")}var Pe=Object.getOwnPropertyNames(he.prototype);for(let e=0;e<Pe.length;++e)Pe[e]!=="constructor"&&Object.defineProperty(he.prototype,Pe[e],{enumerable:!0});typeof L!="undefined"&&typeof L.EventTarget!="undefined"&&Object.setPrototypeOf(he.prototype,L.EventTarget.prototype);var Tr=Qt(sr()),De=30720,te=512e3,re=256,J=(e,{minChunkSize:t=re,maxChunkSize:r=te}={})=>e==null||typeof e=="number"&&e>=256&&e%256===0&&e>=t&&e<=r,Q=(e,{minChunkSize:t=re,maxChunkSize:r=te}={})=>new TypeError(`chunkSize ${e} must be a positive number in multiples of 256, between ${t} and ${r}`),Sr=class{constructor(e,t={}){this.readableStream=e;var r,n,s;if(!J(t.defaultChunkSize,t))throw Q(t.defaultChunkSize,t);this.defaultChunkSize=(r=t.defaultChunkSize)!=null?r:De,this.minChunkSize=(n=t.minChunkSize)!=null?n:re,this.maxChunkSize=(s=t.maxChunkSize)!=null?s:te}get chunkSize(){var e;return(e=this._chunkSize)!=null?e:this.defaultChunkSize}set chunkSize(e){if(!J(e,this))throw Q(e,this);this._chunkSize=e}get chunkByteSize(){return this.chunkSize*1024}get error(){return this._error}async*[Symbol.asyncIterator](){let e,t=this.readableStream.getReader();try{for(;;){let{done:r,value:n}=await t.read();if(r){if(e){let o=e;e=void 0,yield o}break}let s=n instanceof Uint8Array?new Blob([n],{type:"application/octet-stream"}):n;for(e=e?new Blob([e,s]):s;e;)if(e.size===this.chunkByteSize){let o=e;e=void 0,yield o;break}else{if(e.size<this.chunkByteSize)break;{let o=e.slice(0,this.chunkByteSize);e=e.slice(this.chunkByteSize),yield o}}}}catch(r){this._error=r}finally{if(e){let r=e;e=void 0,yield r}t.releaseLock();return}}},wr=class{constructor(e,t={}){this.file=e;var r,n,s;if(!J(t.defaultChunkSize,t))throw Q(t.defaultChunkSize,t);this.defaultChunkSize=(r=t.defaultChunkSize)!=null?r:De,this.minChunkSize=(n=t.minChunkSize)!=null?n:re,this.maxChunkSize=(s=t.maxChunkSize)!=null?s:te}get chunkSize(){var e;return(e=this._chunkSize)!=null?e:this.defaultChunkSize}set chunkSize(e){if(!J(e,this))throw Q(e,this);this._chunkSize=e}get chunkByteSize(){return this.chunkSize*1024}get error(){return this._error}async*[Symbol.asyncIterator](){let e=new FileReader,t=0,r=()=>new Promise(n=>{if(t>=this.file.size){n(void 0);return}let s=Math.min(this.chunkByteSize,this.file.size-t);e.onload=()=>{e.result!==null?n(new Blob([e.result],{type:"application/octet-stream"})):n(void 0)},e.readAsArrayBuffer(this.file.slice(t,t+s))});try{for(;;){let n=await r();if(n)t+=n.size,yield n;else break}}catch(n){this._error=n}}},Ar=[200,201,202,204,308],wt=[408,502,503,504],Rr=[308],At=(e,t)=>!!e&&Ar.includes(e.statusCode),Lr=(e,{retryCodes:t=wt})=>!e||t.includes(e.statusCode),Mr=(e,t)=>t.attemptCount>=t.attempts||!(At(e)||Lr(e,t)),_r=(e,t)=>{var r;if(!e||!Rr.includes(e.statusCode)||!((r=e.headers)!=null&&r.range))return!1;let n=e.headers.range.match(/bytes=(\d+)-(\d+)/);return n?parseInt(n[2],10)<t.currentChunkEndByte:!1},Oe=class{static createUpload(e){return new Oe(e)}constructor(e){if(this.eventTarget=new he,this.endpoint=e.endpoint,this.file=e.file,this.headers=e.headers||{},this.method=e.method||"PUT",this.attempts=e.attempts||5,this.delayBeforeAttempt=e.delayBeforeAttempt||1,this.retryCodes=e.retryCodes||wt,this.dynamicChunkSize=e.dynamicChunkSize||!1,this.maxFileBytes=(e.maxFileSize||0)*1024,this.chunkCount=0,this.attemptCount=0,this._offline=typeof window!="undefined"&&!window.navigator.onLine,this._paused=!1,this.success=!1,this.nextChunkRangeStart=0,e.useLargeFileWorkaround){let t=r=>{this.chunkedIterable.error&&(console.warn(`Unable to read file of size ${this.file.size} bytes via a ReadableStream. Falling back to in-memory FileReader!`),r.stopImmediatePropagation(),this.chunkedIterable=new wr(this.file,{...e,defaultChunkSize:e.chunkSize}),this.chunkedIterator=this.chunkedIterable[Symbol.asyncIterator](),this.getEndpoint().then(()=>{this.sendChunks()}).catch(n=>{let s=n!=null&&n.message?`: ${n.message}`:"";this.dispatch("error",{message:`Failed to get endpoint${s}`})}),this.off("error",t))};this.on("error",t)}this.chunkedIterable=new Sr(this.file.stream(),{...e,defaultChunkSize:e.chunkSize}),this.chunkedIterator=this.chunkedIterable[Symbol.asyncIterator](),this.totalChunks=Math.ceil(this.file.size/this.chunkByteSize),this.validateOptions(),this.getEndpoint().then(()=>this.sendChunks()).catch(t=>{let r=t!=null&&t.message?`: ${t.message}`:"";this.dispatch("error",{message:`Failed to get endpoint${r}`})}),typeof window!="undefined"&&(window.addEventListener("online",()=>{this.offline&&(this._offline=!1,this.dispatch("online"),this.sendChunks())}),window.addEventListener("offline",()=>{this.offline||(this._offline=!0,this.dispatch("offline"))}))}get maxChunkSize(){var e,t;return(t=(e=this.chunkedIterable)==null?void 0:e.maxChunkSize)!=null?t:te}get minChunkSize(){var e,t;return(t=(e=this.chunkedIterable)==null?void 0:e.minChunkSize)!=null?t:re}get chunkSize(){var e,t;return(t=(e=this.chunkedIterable)==null?void 0:e.chunkSize)!=null?t:De}set chunkSize(e){this.chunkedIterable.chunkSize=e}get chunkByteSize(){return this.chunkedIterable.chunkByteSize}get totalChunkSize(){return Math.ceil(this.file.size/this.chunkByteSize)}on(e,t){this.eventTarget.addEventListener(e,t)}once(e,t){this.eventTarget.addEventListener(e,t,{once:!0})}off(e,t){this.eventTarget.removeEventListener(e,t)}get offline(){return this._offline}get paused(){return this._paused}abort(){var e;this.pause(),(e=this.currentXhr)==null||e.abort()}pause(){this._paused=!0}resume(){this._paused&&(this._paused=!1,this.sendChunks())}get successfulPercentage(){return this.nextChunkRangeStart/this.file.size}dispatch(e,t){let r=new CustomEvent(e,{detail:t});this.eventTarget.dispatchEvent(r)}validateOptions(){if(!this.endpoint||typeof this.endpoint!="function"&&typeof this.endpoint!="string")throw new TypeError("endpoint must be defined as a string or a function that returns a promise");if(!(this.file instanceof File))throw new TypeError("file must be a File object");if(this.headers&&typeof this.headers!="function"&&typeof this.headers!="object")throw new TypeError("headers must be null, an object, or a function that returns an object or a promise");if(!J(this.chunkSize,{maxChunkSize:this.maxChunkSize,minChunkSize:this.minChunkSize}))throw Q(this.chunkSize,{maxChunkSize:this.maxChunkSize,minChunkSize:this.minChunkSize});if(this.maxChunkSize&&(typeof this.maxChunkSize!="number"||this.maxChunkSize<256||this.maxChunkSize%256!==0||this.maxChunkSize<this.chunkSize||this.maxChunkSize<this.minChunkSize))throw new TypeError(`maxChunkSize must be a positive number in multiples of 256, and larger than or equal to both ${this.minChunkSize} and ${this.chunkSize}`);if(this.minChunkSize&&(typeof this.minChunkSize!="number"||this.minChunkSize<256||this.minChunkSize%256!==0||this.minChunkSize>this.chunkSize||this.minChunkSize>this.maxChunkSize))throw new TypeError(`minChunkSize must be a positive number in multiples of 256, and smaller than ${this.chunkSize} and ${this.maxChunkSize}`);if(this.maxFileBytes>0&&this.maxFileBytes<this.file.size)throw new Error(`file size exceeds maximum (${this.file.size} > ${this.maxFileBytes})`);if(this.attempts&&(typeof this.attempts!="number"||this.attempts<=0))throw new TypeError("retries must be a positive number");if(this.delayBeforeAttempt&&(typeof this.delayBeforeAttempt!="number"||this.delayBeforeAttempt<0))throw new TypeError("delayBeforeAttempt must be a positive number")}getEndpoint(){return typeof this.endpoint=="string"?(this.endpointValue=this.endpoint,Promise.resolve(this.endpoint)):this.endpoint(this.file).then(e=>{if(this.endpointValue=e,typeof e!="string")throw new TypeError("endpoint must return a string");return this.endpointValue})}xhrPromise(e){let t=r=>{r.upload.onprogress=n=>{var s;let o=this.totalChunks-this.chunkCount,a=(this.file.size-this.nextChunkRangeStart)/this.file.size/o,h=n.loaded/((s=n.total)!=null?s:this.chunkByteSize)*a;this.dispatch("progress",Math.min((this.successfulPercentage+h)*100,100))}};return new Promise((r,n)=>{this.currentXhr=(0,Tr.default)({...e,beforeSend:t},(s,o)=>(this.currentXhr=void 0,s?n(s):r(o)))})}async sendChunk(e){let t=this.nextChunkRangeStart,r=t+e.size-1,s={...await(typeof this.headers=="function"?this.headers():this.headers),"Content-Type":this.file.type,"Content-Range":`bytes ${t}-${r}/${this.file.size}`};return this.dispatch("attempt",{chunkNumber:this.chunkCount,totalChunks:this.totalChunks,chunkSize:this.chunkSize}),this.xhrPromise({headers:s,url:this.endpointValue,method:this.method,body:e})}async sendChunkWithRetries(e){let t=async(a,u)=>{var h;let E=(new Date().getTime()-this.lastChunkStart.getTime())/1e3;if(this.dispatch("chunkSuccess",{chunk:this.chunkCount,chunkSize:this.chunkSize,attempts:this.attemptCount,timeInterval:E,response:a}),this.attemptCount=0,this.chunkCount=((h=this.chunkCount)!=null?h:0)+1,this.nextChunkRangeStart=this.nextChunkRangeStart+this.chunkByteSize,this.dynamicChunkSize){let w=this.chunkSize;E<10?w=Math.min(this.chunkSize*2,this.maxChunkSize):E>30&&(w=Math.max(this.chunkSize/2,this.minChunkSize)),this.chunkSize=Math.ceil(w/256)*256;let ve=(this.file.size-this.nextChunkRangeStart)/this.chunkByteSize;this.totalChunks=Math.ceil(this.chunkCount+ve)}return!0},r=async(a,u)=>(this.dispatch("progress",Math.min(this.successfulPercentage*100,100)),this.dispatch("error",{message:`Server responded with ${a.statusCode}. Stopping upload.`,chunk:this.chunkCount,attempts:this.attemptCount,response:a}),!1),n=async(a,u)=>(this.dispatch("attemptFailure",{message:`An error occured uploading chunk ${this.chunkCount}. ${this.attempts-this.attemptCount} retries left.`,chunkNumber:this.chunkCount,attemptsLeft:this.attempts-this.attemptCount,response:a}),new Promise(h=>{setTimeout(async()=>{if(this._paused||this.offline){this.pendingChunk=e,h(!1);return}let y=await this.sendChunkWithRetries(e);h(y)},this.delayBeforeAttempt*1e3)})),s;try{this.attemptCount=this.attemptCount+1,this.lastChunkStart=new Date,s=await this.sendChunk(e)}catch(a){typeof(a==null?void 0:a.statusCode)=="number"&&(s=a)}let o={retryCodes:this.retryCodes,attemptCount:this.attemptCount,attempts:this.attempts,currentChunkEndByte:this.nextChunkRangeStart+e.size-1};return _r(s,o)?n(s,e):At(s,o)?t(s,e):Mr(s,o)?r(s,e):n(s,e)}async sendChunks(){if(this.pendingChunk&&!(this._paused||this.offline)){let e=this.pendingChunk;this.pendingChunk=void 0;let t=await this.sendChunkWithRetries(e);this.success&&t&&this.dispatch("success")}for(;!(this.success||this._paused||this.offline);){let{value:e,done:t}=await this.chunkedIterator.next(),r=!e&&t;if(e&&(r=await this.sendChunkWithRetries(e)),this.chunkedIterable.error){r=!1,this.dispatch("error",{message:`Unable to read file of size ${this.file.size} bytes. Try loading from another browser.`});return}if(this.success=!!t,this.success&&r&&this.dispatch("success"),!r)return}}};var Rt=(e,t)=>{if(!e)return null;let r=e.closest(t);return r||Rt(e.getRootNode().host,t)},A=e=>{let t=e.getAttribute("mux-uploader");return t?document.getElementById(t):Rt(e,"mux-uploader")};var Lt=C.createElement("template");Lt.innerHTML=`
<style>
  :host {
    position: relative;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 2px dashed #ccc;
    padding: 2.5rem 2rem;
    border-radius: .25rem;
  }

  slot[name='heading'] > * {
    margin-bottom: 0.75rem;
    font-size: 1.75rem;
    text-align: center;
  }

  slot[name='separator'] > * {
    margin-bottom: 0.75rem;
  }

  #overlay {
    display: none;
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    left: 0;
    height: 100%;
    width: 100%;
  }

  :host([active][overlay]) > #overlay {
    background: var(--overlay-background-color, rgba(226, 253, 255, 0.95));
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }

  :host([file-ready])::part(heading),
  :host([file-ready])::part(separator) {
    display: none;
  }
</style>

<slot name="heading" part="heading">
  <span id="drop-text">Drop a video file here to upload</span>
</slot>
<slot name="separator" part="separator">
  <span id="separator-text">or</span>
</slot>
<slot></slot>

<div id="overlay">
  <h1 id="overlay-label"></h1>
</div>
`;var Be={MUX_UPLOADER:"mux-uploader",OVERLAY_TEXT:"overlay-text"},se,S,$,ne=class extends d.HTMLElement{constructor(){super();c(this,se);c(this,S);c(this,$);let r=this.attachShadow({mode:"open"});r.appendChild(Lt.content.cloneNode(!0)),f(this,se,r.getElementById("overlay-label"))}connectedCallback(){if(f(this,S,A(this)),f(this,$,new AbortController),i(this,S)){let r={signal:i(this,$).signal};i(this,S).addEventListener("file-ready",()=>this.toggleAttribute("file-ready",!0),r),i(this,S).addEventListener("uploadstart",()=>this.toggleAttribute("upload-in-progress",!0),r),i(this,S).addEventListener("success",()=>{this.toggleAttribute("upload-in-progress",!1),this.toggleAttribute("upload-complete",!0)},r),i(this,S).addEventListener("reset",()=>{this.toggleAttribute("file-ready",!1),this.toggleAttribute("upload-in-progress",!1),this.toggleAttribute("upload-complete",!1)},r),this.setupDragEvents(r),this.toggleAttribute("upload-in-progress",i(this,S).hasAttribute("upload-in-progress")),this.toggleAttribute("upload-complete",i(this,S).hasAttribute("upload-complete")),this.toggleAttribute("file-ready",i(this,S).hasAttribute("file-ready")),i(this,S).addEventListener("localechange",()=>this.updateText(),r),this.updateText()}}disconnectedCallback(){var r;(r=i(this,$))==null||r.abort()}attributeChangedCallback(r,n,s){r===Be.OVERLAY_TEXT&&n!==s?i(this,se).innerHTML=s!=null?s:"":r==="active"&&this.hasAttribute("overlay")&&s!=null&&(this._currentDragTarget=this)}static get observedAttributes(){return[Be.OVERLAY_TEXT,Be.MUX_UPLOADER,"active"]}setupDragEvents(r){this.addEventListener("dragenter",n=>{this._currentDragTarget=n.target,n.preventDefault(),n.stopPropagation(),this.toggleAttribute("active",!0)},r),this.addEventListener("dragleave",n=>{this._currentDragTarget===n.target&&(this._currentDragTarget=void 0,this.toggleAttribute("active",!1))},r),this.addEventListener("dragover",n=>{n.preventDefault(),n.stopPropagation()},r),this.addEventListener("drop",n=>{var h;n.preventDefault(),n.stopPropagation();let{dataTransfer:s}=n,{files:o}=s,a=o[0];((h=i(this,S))!=null?h:this).dispatchEvent(new CustomEvent("file-ready",{composed:!0,bubbles:!0,detail:a})),this.removeAttribute("active")},r)}updateText(){var o,a,u;let r=(o=i(this,S))==null?void 0:o.locale,n=(a=this.shadowRoot)==null?void 0:a.getElementById("drop-text"),s=(u=this.shadowRoot)==null?void 0:u.getElementById("separator-text");n&&(n.textContent=v("Drop a video file here to upload",r)),s&&(s.textContent=v("or",r))}};se=new WeakMap,S=new WeakMap,$=new WeakMap;d.customElements.get("mux-uploader-drop")||(d.customElements.define("mux-uploader-drop",ne),d.MuxUploaderDropElement=ne);var Pr=ne;function Mt(e){return`${Math.floor(e)}%`}var _t=C.createElement("template"),zr="Media upload progress bar";_t.innerHTML=`
<style>
  :host {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
  }

  .bar-type {
    background: var(--progress-bar-background-color, #e6e6e6);
    border-radius: var(--progress-bar-border-radius, 100px);
    height: var(--progress-bar-height, 4px);
    width: 100%;
  }

  .radial-type,
  .bar-type,
  #percentage-type,
  :host([type="bar"][upload-error]) #percentage-type {
    display: none;
  }

  :host([type="radial"][upload-in-progress]) .radial-type,
  :host([type="bar"][upload-in-progress]) .bar-type {
    display: block;
  }

  :host([type="percentage"][upload-in-progress]) #percentage-type {
    display: var(--progress-percentage-display, block);
  }

  :host([type="bar"][upload-error]) .progress-bar {
    background: #e22c3e;
  }

  .progress-bar {
    box-shadow: var(--progress-bar-box-shadow, 0 10px 40px -10px #fff);
    border-radius: var(--progress-bar-border-radius, 100px);
    background: var(--progress-bar-fill-color, #000000);
    height: var(--progress-bar-height, 4px);
    width: 0%;
    transition: width 0.25s;
  }

  circle {
    stroke: var(--progress-radial-fill-color, black);
    stroke-width: 6;  /* Thickness of the circle */
    fill: transparent; /* Make inside of the circle see-through */

    /* Animation */
    transition: 0.35s;
    transform: rotate(-90deg);
    transform-origin: 50% 50%;
    -webkit-transform-origin: 50% 50%;
    -moz-transform-origin: 50% 50%;
  }

  #percentage-type {
    font-size: inherit;
    margin: 0 0 1em;
  }
</style>

<slot></slot>

<p id="percentage-type"></p>
<div class="bar-type">
  <div role="progressbar" aria-valuemin="0" aria-valuemax="100" class="progress-bar" id="progress-bar" tabindex="0"></div>
</div>
<div class="radial-type">
  <svg
    width="120"
    height="120">
    <!-- To prevent overflow of the SVG wrapper, radius must be  (svgWidth / 2) - (circleStrokeWidth * 2)
      or use overflow: visible on the svg.-->
    <circle
      r="52"
      cx="60"
      cy="60"
    />
  <svg>
</div>
`;var M,W,ce=class extends d.HTMLElement{constructor(){var n,s,o,a;super();c(this,M);c(this,W);this.onUploadStart=()=>{var r;(r=this.progressBar)==null||r.focus(),this.toggleAttribute("upload-in-progress",!0)};this.onProgress=r=>{var s;let n=r.detail;switch((s=this.progressBar)==null||s.setAttribute("aria-valuenow",`${Math.floor(n)}`),this.getAttribute("type")){case H.BAR:{this.progressBar&&(this.progressBar.style.width=`${n}%`);break}case H.RADIAL:{if(this.svgCircle){let o=this.getCircumference()-n/100*this.getCircumference();this.svgCircle.style.strokeDashoffset=o.toString()}break}case H.PERCENTAGE:{this.uploadPercentage&&(this.uploadPercentage.innerHTML=Mt(n));break}}};this.onSuccess=()=>{this.toggleAttribute("upload-in-progress",!1),this.toggleAttribute("upload-complete",!0)};this.onReset=()=>{this.toggleAttribute("upload-in-progress",!1),this.uploadPercentage&&(this.uploadPercentage.innerHTML=""),this.svgCircle&&(this.svgCircle.style.strokeDashoffset=`${this.getCircumference()}`)};this.attachShadow({mode:"open"}).appendChild(_t.content.cloneNode(!0)),this.svgCircle=(n=this.shadowRoot)==null?void 0:n.querySelector("circle"),this.progressBar=(s=this.shadowRoot)==null?void 0:s.getElementById("progress-bar"),this.uploadPercentage=(o=this.shadowRoot)==null?void 0:o.getElementById("percentage-type"),(a=this.progressBar)==null||a.setAttribute("aria-description",zr)}connectedCallback(){if(this.setDefaultType(),f(this,M,A(this)),f(this,W,new AbortController),i(this,M)){let r={signal:i(this,W).signal};i(this,M).addEventListener("uploadstart",this.onUploadStart,r),i(this,M).addEventListener("reset",this.onReset),i(this,M).addEventListener("progress",this.onProgress),i(this,M).addEventListener("success",this.onSuccess),this.toggleAttribute("upload-in-progress",i(this,M).hasAttribute("upload-in-progress")),this.toggleAttribute("upload-complete",i(this,M).hasAttribute("upload-complete"))}}disconnectedCallback(){var r;(r=i(this,W))==null||r.abort()}getRadius(){var r;return Number((r=this.svgCircle)==null?void 0:r.getAttribute("r"))}getCircumference(){return this.getRadius()*2*Math.PI}setDefaultType(){let r=this.getAttribute("type");r||this.setAttribute("type",H.BAR),r===H.RADIAL&&this.svgCircle&&(this.svgCircle.style.strokeDasharray=`${this.getCircumference()} ${this.getCircumference()}`,this.svgCircle.style.strokeDashoffset=`${this.getCircumference()}`)}};M=new WeakMap,W=new WeakMap;d.customElements.get("mux-uploader-progress")||d.customElements.define("mux-uploader-progress",ce);var Ur=ce;var Pt=C.createElement("template");Pt.innerHTML=`
<style>

:host([upload-error]) {
  color: #e22c3e;
}
</style>

<span id="status-message" role="status" aria-live="polite"></span>
`;var x,q,fe=class extends d.HTMLElement{constructor(){var n;super();c(this,x);c(this,q);this.clearStatusMessage=()=>{this.toggleAttribute("upload-error",!1),this.statusMessage&&(this.statusMessage.innerHTML="")};this.onUploadError=r=>{this.toggleAttribute("upload-error",!0),this.statusMessage&&(this.statusMessage.innerHTML=r.detail.message)};this.onSuccess=()=>{var s;this.toggleAttribute("upload-error",!1);let r=(s=i(this,x))==null?void 0:s.locale,n=v("Upload complete!",r);this.statusMessage&&(this.statusMessage.innerHTML=n),console.info(n)};this.onOffline=()=>{this.toggleAttribute("upload-error",!1);let r="Currently offline. Upload will resume automatically when online.";this.statusMessage&&(this.statusMessage.innerHTML=r)};this.attachShadow({mode:"open"}).appendChild(Pt.content.cloneNode(!0)),this.statusMessage=(n=this.shadowRoot)==null?void 0:n.getElementById("status-message")}connectedCallback(){if(f(this,x,A(this)),f(this,q,new AbortController),i(this,x)){let r={signal:i(this,q).signal};i(this,x).addEventListener("reset",this.clearStatusMessage,r),i(this,x).addEventListener("uploaderror",this.onUploadError,r),i(this,x).addEventListener("success",this.onSuccess,r),i(this,x).addEventListener("uploadstart",this.clearStatusMessage,r),i(this,x).addEventListener("offline",this.onOffline,r),i(this,x).addEventListener("online",this.clearStatusMessage,r),this.toggleAttribute("upload-in-progress",i(this,x).hasAttribute("upload-in-progress")),this.toggleAttribute("upload-complete",i(this,x).hasAttribute("upload-complete")),this.toggleAttribute("upload-error",i(this,x).hasAttribute("upload-error")),i(this,x).addEventListener("localechange",()=>{var n,s,o;if((n=this.statusMessage)!=null&&n.textContent&&((s=i(this,x))!=null&&s.hasAttribute("upload-complete"))){let a=(o=i(this,x))==null?void 0:o.locale;this.statusMessage.innerHTML=v("Upload complete!",a)}},r)}}disconnectedCallback(){var r;(r=i(this,q))==null||r.abort()}};x=new WeakMap,q=new WeakMap;d.customElements.get("mux-uploader-status")||d.customElements.define("mux-uploader-status",fe);var Dr=fe;var zt=C.createElement("template");zt.innerHTML=`
<style>
  #retry-button {
    color: #e22c3e;
    text-decoration-line: underline;
    cursor: pointer;
    position: relative;
    display: none;
  }

  :host([upload-error]) #retry-button {
    display: inline-block;
  }
</style>

<span id="retry-button" role="button" tabindex="0">Try again</span>
`;var _,X,me=class extends d.HTMLElement{constructor(){var n;super();c(this,_);c(this,X);this.handleKeyup=r=>{let n=["Enter"," "],{key:s}=r;n.includes(s)&&this.triggerReset()};this.triggerReset=()=>{var r;(r=i(this,_))==null||r.dispatchEvent(new CustomEvent("reset"))};this.attachShadow({mode:"open"}).appendChild(zt.content.cloneNode(!0)),this.retryButton=(n=this.shadowRoot)==null?void 0:n.getElementById("retry-button")}connectedCallback(){var r,n;if(f(this,_,A(this)),f(this,X,new AbortController),i(this,_)){let s={signal:i(this,X).signal};i(this,_).addEventListener("uploaderror",()=>this.toggleAttribute("upload-error",!0)),i(this,_).addEventListener("reset",()=>this.toggleAttribute("upload-error",!1)),(r=this.retryButton)==null||r.addEventListener("click",this.triggerReset,s),(n=this.retryButton)==null||n.addEventListener("keyup",this.handleKeyup,s),this.toggleAttribute("upload-error",i(this,_).hasAttribute("upload-error")),i(this,_).addEventListener("localechange",()=>this.updateText(),s),this.updateText()}}disconnectedCallback(){var r;(r=i(this,X))==null||r.abort()}updateText(){var n;let r=(n=i(this,_))==null?void 0:n.locale;this.retryButton&&(this.retryButton.textContent=v("Retry",r))}};_=new WeakMap,X=new WeakMap;d.customElements.get("mux-uploader-retry")||d.customElements.define("mux-uploader-retry",me);var Or=me;var Ut=C.createElement("template");Ut.innerHTML=`
<style>
#pause-button {
  cursor: pointer;
  line-height: 16px;
  background: #fff;
  border: 1px solid #000;
  color: #000000;
  padding: 16px 24px;
  border-radius: 4px;
  -webkit-transition: all 0.2s ease;
  transition: all 0.2s ease;
  font-family: inherit;
  font-size: inherit;
  position: relative;
  display: none;
}

#pause-button:hover:not(:disabled) {
  color: #fff;
  background: #404040;
}

#pause-button:active {
  color: #fff;
  background: #000;
}

#pause-button:disabled {
  cursor: not-allowed;
}

:host([upload-in-progress]:not([upload-error], [upload-complete])) #pause-button {
  display: initial;
}
</style>

<button id="pause-button">Pause</span>
`;var m,G,ge=class extends d.HTMLElement{constructor(){super();c(this,m);c(this,G);this.triggerPause=()=>{if(!i(this,m)){console.warn("pausing before a mux-uploader element is associated is unsupported!");return}this.pauseButton.disabled||(i(this,m).paused=!i(this,m).paused)};this.attachShadow({mode:"open"}).appendChild(Ut.content.cloneNode(!0))}connectedCallback(){if(f(this,m,A(this)),f(this,G,new AbortController),i(this,m)){let r={signal:i(this,G).signal};i(this,m).addEventListener("uploadstart",()=>this.toggleAttribute("upload-in-progress",!0),r),i(this,m).addEventListener("uploaderror",()=>{this.toggleAttribute("upload-error",!0),this.toggleAttribute("upload-complete",!1),this.toggleAttribute("upload-in-progress",!1)}),i(this,m).addEventListener("success",()=>{this.toggleAttribute("upload-complete",!0),this.toggleAttribute("upload-error",!1),this.toggleAttribute("upload-in-progress",!1)}),i(this,m).addEventListener("reset",()=>{this.toggleAttribute("upload-error",!1),this.toggleAttribute("upload-in-progress",!1),this.toggleAttribute("upload-complete",!1)}),i(this,m).addEventListener("pausedchange",()=>{var s;if(this.pauseButton.disabled=!1,!i(this,m))return;let n=(s=i(this,m).paused)!=null?s:!1;this.updateText(),n&&(this.pauseButton.disabled=!0,i(this,m).addEventListener("chunksuccess",()=>{this.updateText(),this.pauseButton.disabled=!1},{once:!0}))}),this.pauseButton.addEventListener("click",this.triggerPause,r),this.toggleAttribute("upload-in-progress",i(this,m).hasAttribute("upload-in-progress")),this.toggleAttribute("upload-complete",i(this,m).hasAttribute("upload-complete")),this.toggleAttribute("upload-error",i(this,m).hasAttribute("upload-error")),i(this,m).addEventListener("localechange",()=>this.updateText(),r),this.updateText()}}disconnectedCallback(){var r;(r=i(this,G))==null||r.abort()}get pauseButton(){var r;return(r=this.shadowRoot)==null?void 0:r.getElementById("pause-button")}updateText(){var o,a,u,h;let r=(o=i(this,m))==null?void 0:o.locale,n=(u=(a=i(this,m))==null?void 0:a.paused)!=null?u:!1;((h=this.pauseButton)==null?void 0:h.disabled)&&n?this.pauseButton.innerHTML=v("Pausing...",r):this.pauseButton.innerHTML=n?v("Resume",r):v("Pause",r)}};m=new WeakMap,G=new WeakMap;d.customElements.get("mux-uploader-pause")||d.customElements.define("mux-uploader-pause",ge);var Br=ge;var Ie=`
  <style>
  #file-select {
    cursor: pointer;
    line-height: 16px;
    background: #fff;
    border: 1px solid #000;
    color: #000000;
    padding: 16px 24px;
    border-radius: 4px;
    -webkit-transition: all 0.2s ease;
    transition: all 0.2s ease;
    font-family: inherit;
    font-size: inherit;
    position: relative;
  }

  #file-select:hover {
    color: #fff;
    background: #404040;
  }

  #file-select:active {
    color: #fff;
    background: #000;
  }

  </style>

  <button id="file-select" type="button" part="file-select-button">Upload a video</button>
`,Dt=C.createElement("template");Dt.innerHTML=`
  <style>
    :host { display: inline-block; }

    :host([file-ready]) > slot  {
      display: none;
    }
  </style>

  <slot>
    ${Ie}
  </slot>
`;var P,R,V,be=class extends d.HTMLElement{constructor(){var n,s,o;super();c(this,P);c(this,R);c(this,V);this.attachShadow({mode:"open"}).appendChild(Dt.content.cloneNode(!0)),this.handleFilePickerElClick=this.handleFilePickerElClick.bind(this),this.filePickerEl=(n=this.shadowRoot)==null?void 0:n.querySelector("button"),(o=(s=this.shadowRoot)==null?void 0:s.querySelector("slot"))==null||o.addEventListener("slotchange",a=>{let u=a.currentTarget;this.filePickerEl=u.assignedElements({flatten:!0}).filter(h=>!["STYLE"].includes(h.nodeName))[0],this.updateText()})}connectedCallback(){if(f(this,R,A(this)),f(this,V,new AbortController),i(this,R)){let r={signal:i(this,V).signal};i(this,R).addEventListener("file-ready",()=>{this.toggleAttribute("file-ready",!0)},r),i(this,R).addEventListener("uploadstart",()=>this.toggleAttribute("upload-in-progress",!0),r),i(this,R).addEventListener("success",()=>{this.toggleAttribute("upload-in-progress",!1),this.toggleAttribute("upload-complete",!0)},r),i(this,R).addEventListener("reset",()=>{this.toggleAttribute("file-ready",!1)},r),this.toggleAttribute("upload-in-progress",i(this,R).hasAttribute("upload-in-progress")),this.toggleAttribute("upload-complete",i(this,R).hasAttribute("upload-complete")),this.toggleAttribute("file-ready",i(this,R).hasAttribute("file-ready")),i(this,R).addEventListener("localechange",()=>this.updateText(),r),this.updateText()}}disconnectedCallback(){var r;(r=i(this,V))==null||r.abort()}get filePickerEl(){return i(this,P)}set filePickerEl(r){r!==i(this,P)&&(i(this,P)&&i(this,P).removeEventListener("click",this.handleFilePickerElClick),f(this,P,r),i(this,P)&&i(this,P).addEventListener("click",this.handleFilePickerElClick))}handleFilePickerElClick(){var s,o;let r=this.getAttribute("mux-uploader"),n=r?C.getElementById(r):this.getRootNode().host;(o=(s=n==null?void 0:n.shadowRoot)==null?void 0:s.querySelector("#hidden-file-input"))==null||o.click()}updateText(){var o,a;let r=(o=i(this,R))==null?void 0:o.locale,n=v("Upload a video",r),s=(a=this.shadowRoot)==null?void 0:a.querySelector("#file-select");s&&(s.textContent=n)}};P=new WeakMap,R=new WeakMap,V=new WeakMap;d.customElements.get("mux-uploader-file-select")||d.customElements.define("mux-uploader-file-select",be);var Ir=be;function ye(e,t){return e?"":t}var Fr=(e,t)=>{if(t==null||t===!1)return"";let r=t===!0?"":`${t}`;return`${e}="${r}"`};function Fe(e){let{noDrop:t,noProgress:r,noStatus:n,noRetry:s,pausable:o,type:a}=e,u=t?"div":'mux-uploader-drop overlay part="drop"',h=ye(r,`
      <mux-uploader-progress part="progress progress-percentage" type="percentage"></mux-uploader-progress>
      <mux-uploader-progress part="progress progress-bar" ${Fr("type",a)}></mux-uploader-progress>
    `),y=ye(n,'<mux-uploader-status part="status"></mux-uploader-status>'),E=ye(s,'<mux-uploader-retry part="retry"></mux-uploader-retry>'),w=ye(!o,'<mux-uploader-pause part="pause"></mux-uploader-pause>');return C.createRange().createContextualFragment(`
    <${u}>
      ${y}
      ${E}
      ${w}

      <mux-uploader-file-select part="file-select">
        <slot name="file-select">
          ${Ie}
        </slot>
      </mux-uploader-file-select>

      ${h}
    </${u}>
  `)}var Ot=C.createElement("template");Ot.innerHTML=`
<style>
  :host {
    display: flex;
    flex-direction: column;
  }

  mux-uploader-drop {
    flex-grow: 1;
  }

  input[type="file"] {
    display: none;
  }
</style>

<input id="hidden-file-input" type="file" accept="video/*, audio/*" />
<mux-uploader-sr-text></mux-uploader-sr-text>
`;var ie=class extends d.HTMLElement{static get observedAttributes(){return["pausable","type","no-drop","no-progress","no-status","no-retry","max-file-size","use-large-file-workaround","locale"]}constructor(){var r;super(),this.attachShadow({mode:"open"}).appendChild(Ot.content.cloneNode(!0)),this.updateLayout(),(r=this.hiddenFileInput)==null||r.addEventListener("change",()=>{var s,o;let n=(o=(s=this.hiddenFileInput)==null?void 0:s.files)==null?void 0:o[0];this.toggleAttribute("file-ready",!!n),n&&this.dispatchEvent(new CustomEvent("file-ready",{composed:!0,bubbles:!0,detail:n}))})}connectedCallback(){this.addEventListener("file-ready",this.handleUpload),this.addEventListener("reset",this.resetState)}disconnectedCallback(){this.removeEventListener("file-ready",this.handleUpload,!1),this.removeEventListener("reset",this.resetState)}attributeChangedCallback(t,r,n){t==="locale"&&r!==n?this.dispatchEvent(new CustomEvent("localechange",{detail:{locale:n}})):t!=="locale"&&this.updateLayout()}get hiddenFileInput(){var t;return(t=this.shadowRoot)==null?void 0:t.querySelector("#hidden-file-input")}get endpoint(){var t;return(t=this.getAttribute("endpoint"))!=null?t:this._endpoint}set endpoint(t){t!==this.endpoint&&(typeof t=="string"?this.setAttribute("endpoint",t):t==null&&this.removeAttribute("endpoint"),this._endpoint=t)}get type(){var t;return(t=this.getAttribute("type"))!=null?t:void 0}set type(t){t!=this.type&&(t?this.setAttribute("type",t):this.removeAttribute("type"))}get noDrop(){return this.hasAttribute("no-drop")}set noDrop(t){this.toggleAttribute("no-drop",!!t)}get noProgress(){return this.hasAttribute("no-progress")}set noProgress(t){this.toggleAttribute("no-progress",!!t)}get noStatus(){return this.hasAttribute("no-status")}set noStatus(t){this.toggleAttribute("no-status",!!t)}get noRetry(){return this.hasAttribute("no-retry")}set noRetry(t){this.toggleAttribute("no-retry",!!t)}get pausable(){return this.hasAttribute("pausable")}set pausable(t){this.toggleAttribute("pausable",!!t)}get dynamicChunkSize(){return this.hasAttribute("dynamic-chunk-size")}set dynamicChunkSize(t){t!==this.hasAttribute("dynamic-chunk-size")&&(t?this.setAttribute("dynamic-chunk-size",""):this.removeAttribute("dynamic-chunk-size"))}get useLargeFileWorkaround(){return this.hasAttribute("use-large-file-workaround")}set useLargeFileWorkaround(t){t!=this.useLargeFileWorkaround&&this.toggleAttribute("use-large-file-workaround",!!t)}get maxFileSize(){let t=this.getAttribute("max-file-size");return t!==null?parseInt(t):void 0}set maxFileSize(t){t?this.setAttribute("max-file-size",t.toString()):this.removeAttribute("max-file-size")}get chunkSize(){let t=this.getAttribute("chunk-size");return t!==null?parseInt(t):void 0}set chunkSize(t){t?this.setAttribute("chunk-size",t.toString()):this.removeAttribute("chunk-size")}get locale(){return this.getAttribute("locale")}set locale(t){t!==this.locale&&(t?this.setAttribute("locale",t):this.removeAttribute("locale"))}get upload(){return this._upload}get paused(){var t,r;return(r=(t=this.upload)==null?void 0:t.paused)!=null?r:!1}set paused(t){if(!this.upload){console.warn("Pausing before an upload has begun is unsupported");return}let r=!!t;r!==this.paused&&(r?this.upload.pause():this.upload.resume(),this.toggleAttribute("paused",r),this.dispatchEvent(new CustomEvent("pausedchange",{detail:r})))}updateLayout(){var n,s;let t=(n=this.shadowRoot)==null?void 0:n.querySelector("mux-uploader-drop, div");t&&t.remove();let r=Fe(this);(s=this.shadowRoot)==null||s.appendChild(r)}setError(t){this.setAttribute("upload-error",""),this.dispatchEvent(new CustomEvent("uploaderror",{detail:{message:t}}))}resetState(){this.removeAttribute("upload-error"),this.removeAttribute("upload-in-progress"),this.removeAttribute("upload-complete"),this.hiddenFileInput.value=""}handleUpload(t){let r=this.endpoint,n=this.dynamicChunkSize;if(r)this.removeAttribute("upload-error");else{this.setError(v("No url or endpoint specified - cannot handle upload",this.locale));return}try{let s=Oe.createUpload({endpoint:r,dynamicChunkSize:n,file:t.detail,maxFileSize:this.maxFileSize,chunkSize:this.chunkSize,useLargeFileWorkaround:this.useLargeFileWorkaround});this._upload=s,this.dispatchEvent(new CustomEvent("uploadstart",{detail:{file:s.file,chunkSize:s.chunkSize}})),this.setAttribute("upload-in-progress",""),s.offline&&this.dispatchEvent(new CustomEvent("offline")),s.on("attempt",o=>{this.dispatchEvent(new CustomEvent("chunkattempt",o))}),s.on("chunkSuccess",o=>{this.dispatchEvent(new CustomEvent("chunksuccess",o))}),s.on("error",o=>{this.setAttribute("upload-error",""),console.error("error handler",o.detail.message),this.dispatchEvent(new CustomEvent("uploaderror",o))}),s.on("progress",o=>{this.dispatchEvent(new CustomEvent("progress",o))}),s.on("success",o=>{this.removeAttribute("upload-in-progress"),this.setAttribute("upload-complete",""),this.dispatchEvent(new CustomEvent("success",o))}),s.on("offline",o=>{this.dispatchEvent(new CustomEvent("offline",o))}),s.on("online",o=>{this.dispatchEvent(new CustomEvent("online",o))})}catch(s){s instanceof Error&&this.setError(s.message)}}};d.customElements.get("mux-uploader")||(d.customElements.define("mux-uploader",ie),d.MuxUploaderElement=ie);var Bt=ie;var It=C.createElement("template");It.innerHTML=`
<style>

.sr-only {
  position:absolute;
  left:-10000px;
  top:auto;
  width:1px;
  height:1px;
  overflow:hidden;
}
</style>

<div class="sr-only" id="sr-only" aria-live="polite"></div>
`;var z,Ee=class extends d.HTMLElement{constructor(){var n;super();c(this,z);this.attachShadow({mode:"open"}).appendChild(It.content.cloneNode(!0)),this.srOnlyText=(n=this.shadowRoot)==null?void 0:n.getElementById("sr-only")}connectedCallback(){f(this,z,A(this)),i(this,z)&&(i(this,z).addEventListener("success",this.updateText.bind(this)),i(this,z).addEventListener("localechange",()=>{var r;(r=this.srOnlyText)!=null&&r.textContent&&this.updateText()}))}disconnectedCallback(){i(this,z)&&i(this,z).removeEventListener("success",this.updateText.bind(this))}updateText(){var r;if(this.srOnlyText){let n=(r=i(this,z))==null?void 0:r.locale;this.srOnlyText.textContent=v("Upload complete!",n)}}};z=new WeakMap;d.customElements.get("mux-uploader-sr-text")||d.customElements.define("mux-uploader-sr-text",Ee);var Hr=Ee;var ks=Bt;})();
//# sourceMappingURL=mux-uploader.js.map
