(() => {
  const definitions=Object.freeze({
    zh:Object.freeze({name:'Mandarim',engine:'browser',locale:'zh-CN'}),
    pt:Object.freeze({name:'Português',engine:'device',locale:'pt-BR'}),
    en:Object.freeze({name:'Inglês',engine:'browser',locale:'en-US'}),
    es:Object.freeze({name:'Espanhol',engine:'browser',locale:'es-ES'})
  });
  const capabilities={browser:['zh','pt','en','es'],device:['zh','pt','en','es'],paraformer:[],local:['zh','pt','en','es']};
  const storageKey='aulaRecognitionByLanguageV1';
  let choices={};try{const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');if(saved&&typeof saved==='object')for(const [language,engine]of Object.entries(saved))if(definitions[language]&&capabilities[engine]?.includes(language))choices[language]=language==='zh'?'browser':engine;}catch{}
  // Remove only the retired model cache, leaving transcripts and other models intact.
  window.caches?.delete('aula-paraformer-1.12.33').catch(()=>{});
  function recognition(language){const definition=definitions[language];if(!definition)throw Error('Idioma de reconhecimento não suportado.');return {...definition,language,engine:choices[language]||definition.engine};}
  function setRecognition(language,engine){if(!definitions[language]||!capabilities[engine]?.includes(language))throw Error('Esse motor não reconhece o idioma desta aula.');choices[language]=engine;try{localStorage.setItem(storageKey,JSON.stringify(choices));}catch{}return recognition(language);}
  // Translation is independently routed by language pair; ASR never translates.
  function translation(source,target){if(!definitions[source]||!definitions[target])throw Error('Par de tradução não suportado.');return {source,target,provider:source===target?'identity':'browser',pivot:'en'};}
  window.languageRouting={recognition,setRecognition,translation,supports:(engine,language)=>!!capabilities[engine]?.includes(language)};
})();
