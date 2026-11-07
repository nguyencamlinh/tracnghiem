/**
 * ĐẤU TRƯỜNG TRI THỨC 3D - Google Apps Script backend
 * Tạo Google Sheet riêng, chạy setup() một lần, sau đó Deploy thành Web App.
 * API sử dụng JSONP GET để tương thích GitHub Pages. Không dùng cho dữ liệu nhạy cảm.
 */
const CFG={SHEET_ID:"",MAX_PLAYERS:24,DEFAULT_DURATION:30,SESSION_HOURS:8};
const TABS={META:"Meta",PLAYERS:"Players",QUESTIONS:"Questions",ANSWERS:"Answers"};
function setup(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw new Error("Hãy tạo và mở Google Sheet, sau đó Extensions > Apps Script.");
  PropertiesService.getScriptProperties().setProperty("SHEET_ID",ss.getId());
  Object.values(TABS).forEach((name,i)=>{let sh=ss.getSheetByName(name)||ss.insertSheet(name);sh.clear();const heads={
    Meta:["key","value"],Players:["id","playerKey","roomCode","name","klass","approved","joinedAt","device"],
    Questions:["roomCode","number","text","optionA","optionB","optionC","optionD","correct","duration"],
    Answers:["roomCode","playerId","questionNo","choice","correct","elapsed","submittedAt"]
  }[name];sh.getRange(1,1,1,heads.length).setValues([heads]);sh.setFrozenRows(1);});
  const salt=Utilities.getUuid();const defaultPass="DTT3D@2026";
  const hash=sha256_(salt+sha256_(defaultPass));
  setMeta_("adminUser","giaovien");setMeta_("adminSalt",salt);setMeta_("adminHash",hash);
  setMeta_("activeRoom","");setMeta_("sessionToken","");setMeta_("sessionExpiry","0");
  Logger.log("Setup hoàn tất. Tài khoản: giaovien | Mật khẩu mặc định: "+defaultPass+" (hãy đổi ngay bằng hàm changeTeacherPassword).");
}
function changeTeacherPassword(newUser,newPassword){
  if(!newUser||!newPassword||String(newPassword).length<10)throw new Error("Mật khẩu phải có ít nhất 10 ký tự.");
  const salt=Utilities.getUuid();setMeta_("adminUser",String(newUser));setMeta_("adminSalt",salt);setMeta_("adminHash",sha256_(salt+sha256_(String(newPassword))));
  Logger.log("Đã cập nhật tài khoản giáo viên.");
}
function doGet(e){
  const p=e.parameter||{},cb=p.callback;
  let result;
  try{result=dispatch_(p.action||"",p)}catch(err){result={ok:false,error:String(err.message||err)}}
  const body=JSON.stringify(result);
  if(cb&&/^[A-Za-z_$][\w$]*$/.test(cb))return ContentService.createTextOutput(cb+"("+body+");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}
function dispatch_(action,p){
  switch(action){
    case "login":return login_(p);
    case "join":return join_(p);
    case "studentState":return studentState_(p);
    case "answer":return answer_(p);
    case "teacherState":teacherAuth_(p.token);return teacherState_();
    case "createRoom":teacherAuth_(p.token);return createRoom_();
    case "approve":teacherAuth_(p.token);return approve_(p.playerId);
    case "approveAll":teacherAuth_(p.token);return approveAll_();
    case "saveQuestions":teacherAuth_(p.token);return saveQuestions_(p);
    case "start":teacherAuth_(p.token);return start_();
    case "end":teacherAuth_(p.token);return end_();
    default:return {ok:false,error:"Lệnh không hợp lệ."};
  }
}
function ss_(){const id=PropertiesService.getScriptProperties().getProperty("SHEET_ID")||CFG.SHEET_ID;if(!id)throw new Error("Chưa chạy setup().");return SpreadsheetApp.openById(id)}
function sh_(n){return ss_().getSheetByName(n)}
function meta_(){const rows=sh_(TABS.META).getDataRange().getValues(),o={};rows.slice(1).forEach(r=>o[r[0]]=r[1]);return o}
function setMeta_(k,v){const s=sh_(TABS.META),a=s.getDataRange().getValues();for(let i=1;i<a.length;i++)if(a[i][0]===k){s.getRange(i+1,2).setValue(v);return} s.appendRow([k,v])}
function sha256_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(b=>(b<0?b+256:b).toString(16).padStart(2,"0")).join("")}
function login_(p){const m=meta_(),salt=String(m.adminSalt||"");if(String(p.user)!==String(m.adminUser)||String(p.passHash)!==sha256_(salt+String(p.passHash||"")))return {ok:false,error:"Tên đăng nhập hoặc mật khẩu không đúng."};
  // Client sends SHA-256(password); server verifies a salted hash of that digest.
  const token=Utilities.getUuid()+Utilities.getUuid();setMeta_("sessionToken",token);setMeta_("sessionExpiry",String(Date.now()+CFG.SESSION_HOURS*3600000));return {ok:true,token};
}
function teacherAuth_(token){const m=meta_();if(!token||String(token)!==String(m.sessionToken)||Date.now()>Number(m.sessionExpiry||0))throw new Error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");}
function room_(){const code=String(meta_().activeRoom||"");if(!code)return null;const rows=sh_(TABS.META).getDataRange().getValues();let raw={};rows.slice(1).forEach(r=>raw[r[0]]=r[1]);if(raw.roomCode!==code)return null;return {code,phase:String(raw.phase||"waiting"),duration:Number(raw.duration||30),total:Number(raw.total||0),index:Number(raw.index||0),questionStartedAt:Number(raw.questionStartedAt||0),createdAt:Number(raw.createdAt||0)}}
function createRoom_(){const lock=LockService.getScriptLock();lock.waitLock(10000);try{const code=Math.random().toString(36).slice(2,6).toUpperCase()+Math.random().toString(36).slice(2,4).toUpperCase();setMeta_("activeRoom",code);setMeta_("roomCode",code);setMeta_("phase","waiting");setMeta_("duration","30");setMeta_("total","0");setMeta_("index","0");setMeta_("questionStartedAt","0");setMeta_("createdAt",String(Date.now()));sh_(TABS.PLAYERS).clearContents();sh_(TABS.PLAYERS).appendRow(["id","playerKey","roomCode","name","klass","approved","joinedAt","device"]);sh_(TABS.ANSWERS).clearContents();sh_(TABS.ANSWERS).appendRow(["roomCode","playerId","questionNo","choice","correct","elapsed","submittedAt"]);return {ok:true,room:room_()}}finally{lock.releaseLock()}}
function players_(){const a=sh_(TABS.PLAYERS).getDataRange().getValues();return a.slice(1).filter(r=>r[0]).map(r=>({id:String(r[0]),playerKey:String(r[1]),roomCode:String(r[2]),name:String(r[3]),klass:String(r[4]),approved:String(r[5])==="TRUE"||r[5]===true,joinedAt:Number(r[6]),device:String(r[7]||"")}))}
function join_(p){const code=String(p.code||"").toUpperCase(),name=String(p.name||"").trim(),klass=String(p.klass||"").trim(),room=room_();if(!room||room.code!==code||room.phase!=="waiting")return {ok:false,error:"Mã phòng không tồn tại hoặc phòng không nhận thí sinh."};if(!name||!klass)return {ok:false,error:"Thiếu họ tên hoặc lớp."};const lock=LockService.getScriptLock();lock.waitLock(10000);try{const list=players_();if(list.length>=CFG.MAX_PLAYERS)return {ok:false,error:"Phòng đã đủ 24 thí sinh."};if(list.some(x=>x.name.toLowerCase()===name.toLowerCase()&&x.klass.toLowerCase()===klass.toLowerCase()))return {ok:false,error:"Họ tên và lớp này đã tham gia phòng."};const id=Utilities.getUuid(),key=Utilities.getUuid()+Utilities.getUuid();sh_(TABS.PLAYERS).appendRow([id,key,code,name,klass,false,Date.now(),Utilities.getUuid().slice(0,8)]);return {ok:true,playerId:id,playerKey:key}}finally{lock.releaseLock()}}
function approve_(id){const s=sh_(TABS.PLAYERS),a=s.getDataRange().getValues();for(let i=1;i<a.length;i++)if(String(a[i][0])===String(id)){s.getRange(i+1,6).setValue(true);return {ok:true}}return {ok:false,error:"Không tìm thấy thí sinh."}}
function approveAll_(){const s=sh_(TABS.PLAYERS),n=s.getLastRow();if(n>1)s.getRange(2,6,n-1,1).setValue(true);return {ok:true}}
function questions_(){const a=sh_(TABS.QUESTIONS).getDataRange().getValues();return a.slice(1).filter(r=>r[0]&&r[1]).map(r=>({roomCode:String(r[0]),number:Number(r[1]),text:String(r[2]),options:[String(r[3]),String(r[4]),String(r[5]),String(r[6])],correct:String(r[7]),duration:Number(r[8])}))}
function saveQuestions_(p){const qs=JSON.parse(p.questions||"[]"),duration=Math.max(5,Math.min(180,Number(p.duration)||30)),room=room_();if(!room||room.phase!=="waiting")return {ok:false,error:"Chỉ được sửa câu hỏi khi phòng đang chờ."};if(!qs.length||qs.length>30)return {ok:false,error:"Số câu hỏi phải từ 1 đến 30."};qs.forEach((q,i)=>{if(!q.text||!Array.isArray(q.options)||q.options.length!==4||q.options.some(x=>!String(x).trim())||!["A","B","C","D"].includes(q.correct))throw new Error("Câu "+(i+1)+" chưa đủ nội dung, 4 phương án hoặc đáp án đúng.")});const s=sh_(TABS.QUESTIONS);s.clearContents();s.appendRow(["roomCode","number","text","optionA","optionB","optionC","optionD","correct","duration"]);s.getRange(2,1,qs.length,9).setValues(qs.map((q,i)=>[room.code,i+1,q.text,...q.options,q.correct,duration]));setMeta_("duration",String(duration));setMeta_("total",String(qs.length));return {ok:true,total:qs.length}}
function start_(){const r=room_(),p=players_(),q=questions_().filter(x=>x.roomCode===r?.code);if(!r||r.phase!=="waiting")return {ok:false,error:"Không có phòng đang chờ."};if(p.length!==CFG.MAX_PLAYERS||p.some(x=>!x.approved))return {ok:false,error:"Cần đủ 24 học sinh và tất cả đã được xác nhận."};if(!q.length)return {ok:false,error:"Chưa biên soạn câu hỏi."};setMeta_("phase","running");setMeta_("index","0");setMeta_("questionStartedAt",String(Date.now()));setMeta_("total",String(q.length));return {ok:true}}
function tick_(){const r=room_();if(!r||r.phase!=="running")return r;const ans=sh_(TABS.ANSWERS).getDataRange().getValues().slice(1).filter(x=>x[0]===r.code&&Number(x[2])===r.index+1);const eligible=players_().filter(p=>p.approved).length,expired=Date.now()>=r.questionStartedAt+r.duration*1000;if(expired||ans.length>=eligible){if(r.index+1>=r.total){setMeta_("phase","finished")}else{setMeta_("index",String(r.index+1));setMeta_("questionStartedAt",String(Date.now()))}}return room_()}
function studentAuth_(p){const list=players_(),x=list.find(x=>x.id===String(p.playerId)&&x.playerKey===String(p.playerKey));if(!x)throw new Error("Thông tin phiên thi không hợp lệ.");return x}
function studentState_(p){const player=studentAuth_(p),r=tick_();if(!r)return {ok:false,error:"Phòng thi đã đóng."};if(r.phase==="waiting")return {ok:true,phase:"waiting",approved:player.approved,serverNow:Date.now()};if(r.phase==="finished"){const res=results_().find(x=>x.id===player.id);return {ok:true,phase:"finished",score:res?.score||0,total:r.total,serverNow:Date.now()}}const q=questions_().find(x=>x.roomCode===r.code&&x.number===r.index+1);if(!q)return {ok:false,error:"Không tìm thấy câu hỏi."};const answers=sh_(TABS.ANSWERS).getDataRange().getValues().slice(1),mine=answers.find(x=>x[0]===r.code&&x[1]===player.id&&Number(x[2])===r.index+1);return {ok:true,phase:"running",code:r.code,index:r.index,total:r.total,duration:q.duration,questionStartedAt:r.questionStartedAt,serverNow:Date.now(),question:{text:q.text,options:q.options},answered:!!mine,selected:mine?String(mine[3]):""}}
function answer_(p){const player=studentAuth_(p),r=tick_();if(!r||r.phase!=="running"||!player.approved)return {ok:false,error:"Cuộc thi chưa bắt đầu hoặc bạn chưa được duyệt."};const q=questions_().find(x=>x.roomCode===r.code&&x.number===r.index+1);if(!q||Date.now()>r.questionStartedAt+q.duration*1000)return {ok:false,error:"Đã hết thời gian câu hỏi."};const choice=String(p.choice||"");if(!["A","B","C","D"].includes(choice))return {ok:false,error:"Đáp án không hợp lệ."};const lock=LockService.getScriptLock();lock.waitLock(10000);try{const a=sh_(TABS.ANSWERS).getDataRange().getValues();if(a.slice(1).some(x=>x[0]===r.code&&x[1]===player.id&&Number(x[2])===r.index+1))return {ok:false,error:"Bạn đã trả lời câu này."};const elapsed=Math.max(0,(Date.now()-r.questionStartedAt)/1000);sh_(TABS.ANSWERS).appendRow([r.code,player.id,r.index+1,choice,choice===q.correct,elapsed,Date.now()]);return {ok:true}}finally{lock.releaseLock()}}
function results_(){const r=room_();if(!r)return [];const ps=players_().filter(p=>p.roomCode===r.code),a=sh_(TABS.ANSWERS).getDataRange().getValues().slice(1);return ps.map(p=>{const rows=a.filter(x=>x[0]===r.code&&x[1]===p.id),correct=rows.filter(x=>x[4]===true||String(x[4])==="TRUE").length,time=rows.reduce((s,x)=>s+Number(x[5]||0),0);return {id:p.id,name:p.name,klass:p.klass,score:correct*10,correct,time}}).sort((x,y)=>y.score-x.score||x.time-y.time||x.name.localeCompare(y.name,"vi"))}
function teacherState_(){const r=tick_(),qs=questions_().filter(q=>q.roomCode===r?.code).map(q=>({text:q.text,options:q.options,correct:q.correct}));return {ok:true,room:r,players:players_().filter(p=>p.roomCode===r?.code).map(({playerKey,...p})=>p),questions:qs,duration:r?.duration||30,results:results_(),serverNow:Date.now()}}
function end_(){setMeta_("phase","finished");return {ok:true}}
