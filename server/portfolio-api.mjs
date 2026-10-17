import { randomBytes } from 'node:crypto';
import { db, consumeQuota, transaction } from './database.mjs';
import * as store from './store.mjs';
import { optimizePortfolio } from './portfolio.mjs';

db.exec('CREATE TABLE IF NOT EXISTS portfolios(id TEXT PRIMARY KEY, body TEXT NOT NULL)');
const read=id=>{const row=db.prepare('SELECT body FROM portfolios WHERE id=?').get(id);return row?JSON.parse(row.body):null;};
const publicRecord=record=>({id:record.id,createdAt:record.createdAt,parentId:record.parentId??null,recovery:record.recovery??null,input:record.input,...record.result});
const resolve=record=>(id,eventId)=>record.sourceOverrides?.[eventId]??store.load(id);
function save(record){
  const id=randomBytes(9).toString('base64url');
  transaction(()=>{
    db.prepare('INSERT INTO portfolios(id,body) VALUES(?,?)').run(id,JSON.stringify({...record,id,createdAt:new Date().toISOString()}));
    for(const event of record.input.events)db.prepare('UPDATE snapshots SET pinned=1 WHERE id=?').run(event.sourceId);
  });return id;
}
export function registerPortfolioRoutes(app){
  const quota=(req,res,next)=>{const minute=Math.floor(Date.now()/60000);if(!consumeQuota([{key:`portfolio:${minute}`,limit:12,expires:(minute+1)*60000}]))return res.status(429).json({error:'Portfolio computation limit reached.'});next();};
  app.post('/api/portfolios',quota,(req,res)=>{
    try{const input=req.body,result=optimizePortfolio(input,store.load);const id=save({input,result,sourceOverrides:{}});res.status(201).json(publicRecord(read(id)));}
    catch(error){res.status(400).json({error:error.message});}
  });
  app.get('/api/portfolios/:id',(req,res)=>{
    const record=read(req.params.id);if(!record)return res.status(404).json({error:'Portfolio not found.'});
    res.json(publicRecord(record));
  });
  app.post('/api/portfolios/:id/recover',quota,(req,res)=>{
    try{
      const record=read(req.params.id);if(!record?.result.feasible)throw new Error('Choose a feasible saved portfolio.');
      const {eventId,artistId}=req.body??{},event=record.result.events.find(e=>e.eventId===eventId);
      if(!event?.selectedIds.includes(artistId))throw new Error('Choose an artist selected at that event.');
      const sourceOverrides={};
      for(const row of record.result.events){
        const snapshot=structuredClone(resolve(record)(row.sourceId,row.eventId));
        const canceled=row.eventId===eventId;
        snapshot.memo.constraints={...snapshot.memo.constraints,
          lockedIds:[...new Set([...(snapshot.memo.constraints.lockedIds??[]).filter(id=>!canceled||id!==artistId),...row.selectedIds.filter(id=>!canceled||id!==artistId)])],
          excludedIds:[...new Set([...(snapshot.memo.constraints.excludedIds??[]),...(canceled?[artistId]:[])])]};
        sourceOverrides[row.eventId]=snapshot;
      }
      const recovery={eventId,artistId,scope:'Hypothetical replacement with every surviving booking fixed. Original planning fees apply; cancellation fees and refunds are not inferred.'};
      const next={input:record.input,sourceOverrides,parentId:record.id,recovery};
      next.result=optimizePortfolio(next.input,resolve(next));const id=save(next);
      res.status(201).json(publicRecord(read(id)));
    }catch(error){res.status(400).json({error:error.message});}
  });
}
