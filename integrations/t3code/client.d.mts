export function validateRequest(request: unknown): {type:'request';id:string;method:string;input:Record<string,string>};
export function connectCompanion(config:{url:string;token:string},execute:(method:string,input:Record<string,string>)=>Promise<unknown>,options?:{Socket?:typeof WebSocket;onDisconnect?:()=>void}):()=>void;
