let controller;
let signal;
onmessage = function (o){
    if (controller !== undefined && controller.signal !== undefined && !controller.signal.aborted){
        controller.abort();               
    }
    if (o.data.abort){
        postMessage({t: Date.now(), e: true});
        return;
    }
    controller = new AbortController();
    signal = controller.signal; 
    async function getURL(url){
        await fetch(url);
        //return response
    }
    getURL(o.data);
   // _func.apply(null, [o.data]);
}
