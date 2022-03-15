import {newSession, updateSession, deleteSession, newScene, finishNewScene, deleteScene, sceneStatuses, queryScript, dbAddLog, getAllLogs} from './database.js';
import {unzipSceneFile, deleteFile, getSceneFile, sceneRecognizedUpdateStatus} from './files.js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import express from 'express';
import expressWs from 'express-ws';
import Busboy from 'busboy';
import request from 'request';
import { format } from 'fecha';
import dateFormat, { masks } from "dateformat";

//Инициализация базы (удаление и создание таблиц)
let dbScripts = {
    dropLogsTable:{"script":"DROP TABLE IF EXISTS dbo.Logs", "desc":"Таблица Logs удалена"},
    dropScenesTable:{"script":"DROP TABLE IF EXISTS dbo.Scenes", "desc":"Таблица Scenes удалена"},
    dropClientSessionsTable:{"script":"DROP TABLE IF EXISTS dbo.ClientSessions", "desc":"Таблица ClientSessions удалена"},
    createSchema:{"script":"CREATE SCHEMA IF NOT EXISTS dbo", "desc":"Создана схема dbo"},
    createLogTable:{"script":"CREATE TABLE IF NOT EXISTS dbo.Logs (Id serial primary key, TheDate text NULL, SessionID uuid NULL, Status text NULL, MessageFrom text, Action text, Data text)", "desc":"Создана таблица Logs"},
    createScenesTable:{"script":"CREATE TABLE IF NOT EXISTS dbo.Scenes (SceneID uuid UNIQUE NOT NULL, Processed integer NOT NULL, PutUrl character(200), GetUrl character(200), Checksum character(32) NULL, isActive int NOT NULL, DistributorID character(50) NOT NULL, VisitID character(50) NOT NULL, DocumentID character(50) NOT NULL, CustomerID character(50) NOT NULL, EmployeeID character(50) NOT NULL, Custom character(5000) NULL)", "desc":"Создана таблица Scenes"},
    createClientSessionsTable:{"script":"CREATE TABLE IF NOT EXISTS dbo.ClientSessions (SessionID uuid NOT NULL, isActive integer, DistributorID character(50) NULL, VisitID character(50) NULL, DocumentID character(50) NULL, CustomerID character(50) NULL, EmployeeID character(50) NULL, Custom character(5000) NULL, CreateDate timestamp without time zone NOT NULL, UpdatedDate timestamp without time zone NOT NULL)", "desc":"Создана таблица ClientSessions"}
  };
  queryScript(dbScripts.dropLogsTable)
  .then(() => queryScript(dbScripts.dropScenesTable))
  .then(() => queryScript(dbScripts.dropClientSessionsTable))
  .then(() => queryScript(dbScripts.createSchema))
  .then(() => queryScript(dbScripts.createLogTable))
  .then(() => queryScript(dbScripts.createScenesTable))
  .then(() => queryScript(dbScripts.createClientSessionsTable))
  .then(() => addLogs({"thedate":getNowDate(), "sessionId":"", "status":"GOOD", "messagefrom":"internal_server", "action":"Init DB", "data":"Successful"}, false))
  .catch(function(err){ 
      try {
          addLogs({"thedate":getNowDate(), "sessionId":"", "status":"ERROR", "messagefrom":"internal_server", "action":"Init DB", "data":err.toString()}, false)
        } 
        catch(err) {
            console.log(err.toString())
        } 
        });
  //Инициализация базы (удаление и создание таблиц)
  

const app = expressWs(express()).app;
app.set('port', process.env.PORT || 3000);
app.listen(app.get('port'), () => {
  console.log('Server listening on port %s', app.get('port'));
});

let connects = [];
let siteConnects = [];


// ws.send(result); - отправка ответного сообщения клиенту

/* отправка сообщения всем подключенным клиентам
connects.forEach(socket => {
    socket.send(result);
    });
*/ 
/* пример фильтрации клиентов которым необходимо отправить сообщение
connects.filter(conn => {
    return (conn.clientId === clientId) ? true : false;
    }).forEach(socket => {
    socket.send(result);
    });
*/


app.ws('/onlinereco', (ws, req) => {
    let sessionId = uuidv4();
    ws.sessionId = sessionId;
    connects.push(ws);
    
    newSession(sessionId)
    .then(() => addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"internal_server", "action":"NewConnection", "data":"Successful"}))
    .catch(function(err){
        try {
            addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"internal_server", "action":"NewConnection", "data":err.toString()})
          } 
          catch(err) {
              console.log(err.toString())
          }
        ws.send(getError(err, 'newConnection'));
        ws.close();
    });


    ws.on('close', () => {
        connects = connects.filter(conn => {
            return (conn === ws) ? false : true;
            });
         
        deleteSession (sessionId)
        .then(() => addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"internal_server", "action":"CloseConnection", "data":""}))
        .catch(function(err){
            try {
                addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"internal_server", "action":"CloseConnection", "data":err.toString()})
              } 
              catch(err) {
                  console.log(err.toString())
              }
            ws.close();
        });
      });

    ws.on('message', message => {
        try {
                const jsonMessage = JSON.parse(message);
                switch (jsonMessage.type) {
                    case 'connection':
                        addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"client", "action":"connection", "data":JSON.stringify(jsonMessage)})
                        .then(() => updateSession(sessionId, jsonMessage))
                        .then(() => sceneStatuses(sessionId))
                        .then(function(result) {
                                addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})
                                ws.send(result);
                            })
                        .catch(function(err){
                                try {
                                    addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"server", "action":"connection", "data":JSON.stringify(err.data)})
                                } 
                                catch(err) {
                                    console.log(JSON.stringify(err.data));
                                }
                                    ws.send(getError(err, 'connection'));
                                    ws.close();
                            });
                        
                        break;
                    
                    case 'scene':
                        addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"client", "action":"scene", "data":JSON.stringify(jsonMessage)})
                        .then(() => newScene(sessionId, jsonMessage.data.sceneID))
                        .then(() => sceneStatuses(sessionId))
                        .then(function(result) {
                                addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})
                                ws.send(result);
                                })
                        .catch(function(err){
                                try {
                                    addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"server", "action":"scene", "data":JSON.stringify(err.data)})
                                } 
                                catch(err) {
                                    console.log(JSON.stringify(err.data));
                                }
                                    ws.send(getError(err, 'scene'));
                                    ws.close();
                                });
                        
                        break;
                    
                    case 'finish':
                        let scenePath = process.cwd()+'/scenes/'+jsonMessage.data.sceneID+'.rec';
                        let sceneJsonPath = process.cwd()+'/scenes/'+jsonMessage.data.sceneID+'.json';

                        addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"client", "action":"finish", "data":JSON.stringify(jsonMessage)})    
                        .then(() => unzipSceneFile(jsonMessage.data.sceneID, scenePath))
                        .then(() => deleteFile(scenePath))
                        .then(() => finishNewScene(jsonMessage.data.sceneID, jsonMessage.data.checksum))
                        .then(() => sceneStatuses(sessionId)
                        .then(function(result) {
                            addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})     
                            ws.send(result);
                            }))
                        .then(() => getSceneFile(jsonMessage.data.sceneID))
                        .then(() => sceneRecognizedUpdateStatus(jsonMessage.data.sceneID))
                        .then(() => deleteFile(sceneJsonPath))
                        .then(() => sleep(8000))
                        .then(() => sceneStatuses(sessionId)
                        .then(function(result) {
                            addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})     
                            ws.send(result);
                            }))
                        .catch(function(err){
                            try {
                                addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"server", "action":"finish", "data":JSON.stringify(err.data)})
                            } 
                            catch(err) {
                                console.log(JSON.stringify(err.data));
                            }
                                ws.send(getError(err, 'finish'));
                                ws.close();
                            });

                        break;

                    case 'status':
                    addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"client", "action":"status", "data":JSON.stringify(jsonMessage)})    
                    .then(() => sceneStatuses(sessionId)
                    .then(function(result) {
                        addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})     
                        ws.send(result);
                        }))
                    .catch(function(err){
                        try {
                            addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"server", "action":"status", "data":JSON.stringify(err.data)})
                        } 
                        catch(err) {
                            console.log(JSON.stringify(err.data));
                        }
                            ws.send(getError(err, 'status'));
                            ws.close();
                        });
                        break;
                    
                    case 'delete':
                        addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"client", "action":"delete", "data":JSON.stringify(jsonMessage)}) 
                        .then(() => deleteScene(sessionId, jsonMessage.data.sceneID))
                        .then(() => sceneStatuses(sessionId)
                        .then(function(result) {
                            addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})     
                            ws.send(result);
                            }))
                        .catch(function(err){
                            try {
                                addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"server", "action":"delete", "data":JSON.stringify(err.data)})
                            } 
                            catch(err) {
                                console.log(JSON.stringify(err.data));
                            }
                                ws.send(getError(err, 'status'));
                                ws.close();
                            });

                        break;
                    default:
                        addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"server", "action":jsonMessage.type, "data":JSON.stringify(jsonMessage)})

                        break;
                }
            } catch (error) {
                addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"server", "action":jsonMessage.type, "data":JSON.stringify(err.data)})
            }
        


    });
});

app.ws('/getLogs', (ws, req) => {
    let siteSessionId = uuidv4();
    ws.siteSessionId = siteSessionId;
    siteConnects.push(ws);

    ws.on('close', () => {
        siteConnects = siteConnects.filter(conn => {
            return (conn === ws) ? false : true;
            });
      });

    ws.on('message', message => {
        try {
                const jsonMessage = JSON.parse(message);
                switch (jsonMessage.type) {
                    case 'getAllLogs':

                        getAllLogs().then( function(result) {
                            ws.send( JSON.stringify({type:"allLogs", data:JSON.parse(result)}) );
                        })

                    break;
                     
                    default:
                        ws.send('{"type":"Неизвестная команда от Клиента"}');
                    break;
                }
            } catch (error) {
                ws.send('{"type":"ERROR"}');
            }
    });
  });


app.put('/onlinereco/scene/:sceneID', (req, res) => {
    let scenePath = process.cwd()+'/scenes/'+req.params.sceneID+'.rec'
    var writeStream = fs.createWriteStream(scenePath);
        req.pipe(writeStream);
    req.on('end', function () {
    res.send('ok');
    res.end();
    });
  });
 
app.get('/onlinereco/scene/:sceneID', (req, res) => {
    let scenePath = process.cwd()+'/scenes/result/'+req.params.sceneID+'.rec' 
    res.download(scenePath);
  });

app.get('/logs',(req,res) => {
    app.use(express.static(process.cwd()+'/public')); 
    res.status(200);
    res.sendFile(process.cwd()+'/public/index.html');
  });

app.post('/offlinereco', (req, res) => {
    var busboy = new Busboy({ headers: req.headers });
    let answer = [];
    
    busboy.on('field', (fieldname, file, filename, encoding, mimetype) => { 
        console.log('field: '+file);
        let sceneIDUpload = JSON.parse(file)[0].sceneID;
        answer = JSON.parse(file);
        answer[0].responseStatus = 201;
        delete answer[0].fileName;
        delete answer[0].fileChecksum;
        delete answer[0].documentRecognitionStatusCode;

        let resulturl = JSON.parse(JSON.stringify(req.headers))['result-url'];
        let documentRecognitionStatusCode = JSON.parse(file)[0].documentRecognitionStatusCode;
        if (documentRecognitionStatusCode == 'NeedRecognition')
            {
                sleep(5000).then(function(result) {console.log(result)})
                .then(() => unzipSceneFile(sceneIDUpload, './scenes/scenesOffline/'+sceneIDUpload+'.rec'))
                .then(() => deleteFile('./scenes/scenesOffline/'+sceneIDUpload+'.rec'))
                .then(() => getSceneFile(sceneIDUpload))
                .then(() => sendPostResult(resulturl, answer, './scenes/result/'+sceneIDUpload+'.rec', sceneIDUpload))
                .catch(function(err){
                    console.log(err);
                });
            }

      });
    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
        console.log('file: '+JSON.stringify(fieldname));
        file.pipe(fs.createWriteStream('./scenes/scenesOffline/'+fieldname+'.rec'));
    });
    busboy.on('finish', function() {
      console.log('Upload complete');
      res.setHeader("Content-Type", "application/json");
      res.status(207).json(answer);
      res.end();
    });
    return req.pipe(busboy);
  }); 

async function sleep(timeout) {
    return	new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve('Inside test await');
        }, timeout);
    });
  };

async function sendPostResult (url, scenes, resultFilePath, sceneID) {
    delete scenes[0].responseStatus;
    scenes[0].fileName = sceneID+'.rec';

    return	new Promise((resolve, reject) => {
        var formData = {
            'scenes': JSON.stringify(scenes),
            [sceneID]: fs.createReadStream(resultFilePath)
        };
        var uploadOptions = {
            "url": url,
            "method": "POST",
            "headers": {
                "Token": "8CEB1B0C-1FEB-48EA-8F96-BB4DDBBB06D9"
            },
            "formData": formData
        }
        var req = request(uploadOptions, function(err, resp, body) {
            if (err) {
                console.log('Error ', err);
            } else {
                console.log('upload successful', body)
            }
        });
    }); 
  }; 

async function addLogs(log, send = true) {
    return	new Promise((resolve, reject) => {
       try {
            dbAddLog(log)
            .then(() => {
                if(send) {
                    siteConnects.forEach(socket => {
                        socket.send( JSON.stringify({type:"partialLogs", data:[log]}) );
                        });
                    }
                resolve('LOG added');
                });
       }
       catch(err) {
            return reject( {type:"addLog", data:err.toString()} )
       }
    }); 
  };

function getNowDate() {
    return dateFormat(new Date(), "yyyy-mm-dd HH:MM:ss.l o");
 };

function getError(err, type /*, errorCode, description*/) {
    switch (err.type) {
        case "newConnection": return '{"type":"error", "data":{"requestType":"'+type+'", "errorCode":"ERROR_INTERNAL_SERVER_ERROR", "errorDescription":'+JSON.stringify(err.data)+'}}';  
        case "sceneStatuses": return '{"type":"error", "data":{"requestType":"'+type+'", "errorCode":"ERROR_INTERNAL_SERVER_ERROR", "errorDescription":'+JSON.stringify(err.data)+'}}';
        case "status": return '{"type":"error", "data":{"requestType":"'+type+'", "errorCode":"ERROR_INTERNAL_SERVER_ERROR", "errorDescription":'+JSON.stringify(err.data)+'}}';   
        case "scene": return '{"type":"error", "data":{"requestType":"'+type+'", "errorCode":"ERROR_INTERNAL_SERVER_ERROR", "errorDescription":'+JSON.stringify(err.data)+'}}';
        case "finish": return '{"type":"error", "data":{"requestType":"'+type+'", "errorCode":"ERROR_INTERNAL_SERVER_ERROR", "errorDescription":'+JSON.stringify(err.data)+'}}';
        default: return '{"type":"error", "data":{"requestType":"'+type+'", "errorCode":"ERROR_INTERNAL_SERVER_ERROR", "errorDescription":"'+JSON.stringify(err.data)+'"}}';
    }
  };