/* The 404 page's GitHub button: a grid of square cells that floods dark from left to right
   under the pointer (each cell steps through greys) and drains away again when it leaves. */
'use strict';
(()=>{
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.px-btn').forEach(button=>{
    const grid=button.querySelector('.px-cells');if(!grid||reduced)return;
    const build=()=>{
      const size=7,cols=Math.max(8,Math.round(button.offsetWidth/size)),rows=Math.max(3,Math.round(button.offsetHeight/size));
      grid.style.setProperty('--cols',cols);grid.textContent='';
      const frag=document.createDocumentFragment();
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
        const cell=document.createElement('i');
        cell.style.setProperty('--d',`${(c/cols*.3+Math.random()*.14).toFixed(3)}s`);
        frag.append(cell);
      }
      grid.append(frag);
    };
    build();
    const on=()=>{button.classList.remove('is-off');button.classList.add('is-on');};
    const off=()=>{if(!button.classList.contains('is-on'))return;button.classList.remove('is-on');button.classList.add('is-off');};
    button.addEventListener('pointerenter',on);button.addEventListener('pointerleave',off);
    button.addEventListener('focus',on);button.addEventListener('blur',off);
    addEventListener('resize',()=>{clearTimeout(build.t);build.t=setTimeout(build,200);});
  });
})();
