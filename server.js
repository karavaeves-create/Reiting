import express from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.dirname(fileURLToPath(import.meta.url)), app=express();
app.use(express.json({limit:"100kb"})); app.use(express.static(path.join(root,"public")));
const PORT=process.env.PORT||10000, TOKEN=process.env.BOT_TOKEN||"", ADMINS=new Set((process.env.ADMIN_IDS||"").split(",").map(x=>x.trim()).filter(Boolean)), FILE=process.env.DATA_FILE||path.join(root,"data","rating.json");
const seed=[["Александров Максим",1],["Аматуни Карина",1],["Астанова Вероника",2],["Большакова Виктория",2],["Браславский Кирилл",2],["Глухова Мария",1],["Ермакова Алиса",2],["Звада Марья",1],["Злыдарев Сергей",1],["Коломина Елена",1],["Кудрявцев Егор",1],["Кулиш Артемий",1],["Негматова Алина",3],["Орлов Демид",1],["Орлова Виктория",1],["Сабанина Милана",1],["Серебренников Алексей",2],["Слузова Олеся",1],["Чувашова Елизавета",1],["Шевелёв Михаил",1],["Шубина Анна",2]];
let db; const streams=new Set();
async function save(){await fs.mkdir(path.dirname(FILE),{recursive:true});const tmp=FILE+".tmp";await fs.writeFile(tmp,JSON.stringify(db,null,2));await fs.rename(tmp,FILE)}
async function init(){try{db=JSON.parse(await fs.readFile(FILE,"utf8"))}catch{db={counselors:seed.map(([name,score],i)=>({id:String(i+1),name,score})),history:[]};await save()}}
function verify(raw){if(!TOKEN)throw Error("На сервере не задан BOT_TOKEN");const p=new URLSearchParams(raw||""),hash=p.get("hash"),date=Number(p.get("auth_date")||0);if(!hash||!date||Math.abs(Date.now()/1000-date)>86400)throw Error("Сессия Telegram истекла. Закрой и снова открой приложение.");p.delete("hash");p.delete("signature");const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");const key=crypto.createHmac("sha256","WebAppData").update(TOKEN).digest();const actual=crypto.createHmac("sha256",key).update(check).digest("hex");const a=Buffer.from(hash,"hex"),b=Buffer.from(actual,"hex");if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw Error("Не удалось проверить Telegram");const user=JSON.parse(p.get("user")||"null");if(!user?.id)throw Error("Не найден пользователь Telegram");return{id:String(user.id),name:[user.first_name,user.last_name].filter(Boolean).join(" ")}}
function auth(req,res,next){try{const h=req.headers.authorization||"";if(!h.startsWith("tma "))throw Error("Открой приложение через Telegram");req.user=verify(h.slice(4));req.user.admin=ADMINS.has(req.user.id);next()}catch(e){res.status(401).json({error:e.message})}}
function admin(req,res,next){if(!req.user.admin)return res.status(403).json({error:"Начислять баллы могут только организаторы"});next()}
function broadcast(){const msg=`data: ${JSON.stringify(db)}\n\n`;for(const s of streams)s.write(msg)}
app.get("/api/health",(_,r)=>r.json({ok:true}));
app.get("/api/config",auth,(q,r)=>r.json({user:q.user,isAdmin:q.user.admin}));
app.get("/api/state",auth,(_,r)=>r.json(db));
app.get("/api/events",auth,(q,r)=>{r.set({"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive"});r.flushHeaders?.();r.write(`data: ${JSON.stringify(db)}\n\n`);streams.add(r);q.on("close",()=>streams.delete(r))});
app.post("/api/score",auth,admin,async(q,r)=>{const {counselorId,delta,note=""}=q.body||{},p=db.counselors.find(x=>x.id===String(counselorId)),d=Number(delta);if(!p)return r.status(404).json({error:"Вожатый не найден"});if(![1,2,3,-1,-2,-3].includes(d))return r.status(400).json({error:"Допустимо изменить от 1 до 3 баллов"});if(p.score+d<0)return r.status(400).json({error:"Баллы не могут быть меньше нуля"});p.score+=d;db.history.unshift({id:crypto.randomUUID(),counselorId:p.id,counselorName:p.name,delta:d,note:String(note).slice(0,160),by:q.user.name,at:new Date().toISOString()});db.history=db.history.slice(0,500);await save();broadcast();r.json({ok:true})});
app.get("*",(_,r)=>r.sendFile(path.join(root,"public","index.html")));
await init();app.listen(PORT,"0.0.0.0",()=>console.log("Listening on "+PORT));
