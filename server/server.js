import {config} from './config/config.js';
import  * as db  from './database.js';
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
  let defaultRecResData = [];
  getDefaultRecResData().then(function(result) { defaultRecResData = result; })
  .then(() => db.queryScript("DROP TABLE IF EXISTS dbo.Logs"))
  .then(() => db.queryScript("DROP TABLE IF EXISTS dbo.Scenes"))
  .then(() => db.queryScript("DROP TABLE IF EXISTS dbo.ClientSessions"))
  .then(() => db.queryScript("DROP TABLE IF EXISTS dbo.RecognitionResults"))
  .then(() => db.queryScript("DROP TABLE IF EXISTS dbo.GenerateErrors"))
  .then(() => db.queryScript("CREATE SCHEMA IF NOT EXISTS dbo"))
  .then(() => db.queryScript("CREATE TABLE IF NOT EXISTS dbo.Logs (Id serial primary key, TheDate timestamp NOT NULL, SessionID uuid NULL, Status text NULL, MessageFrom text, Action text, Data text)"))
  .then(() => db.queryScript("CREATE TABLE IF NOT EXISTS dbo.Scenes (Id serial primary key, SceneID uuid UNIQUE NOT NULL, Processed integer NOT NULL, ErrorCode text NULL, ErrorDescription text NULL, PutUrl text, GetUrl text, Checksum text NULL, isActive int NOT NULL, DistributorID text NOT NULL, VisitID text NOT NULL, DocumentID text NOT NULL, CustomerID text NOT NULL, EmployeeID text NOT NULL, Custom text NULL, CreateDate timestamp NOT NULL, UpdatedDate timestamp NOT NULL)"))
  .then(() => db.queryScript("CREATE TABLE IF NOT EXISTS dbo.ClientSessions (Id serial primary key, SessionID uuid NOT NULL, isActive integer, DistributorID text NULL, VisitID text NULL, DocumentID text NULL, CustomerID text NULL, EmployeeID text NULL, Custom text NULL, CreateDate timestamp NOT NULL, UpdatedDate timestamp NOT NULL)"))
  .then(() => db.queryScript("CREATE TABLE IF NOT EXISTS dbo.RecognitionResults (Id serial primary key, DistributorID text UNIQUE NOT NULL, RecognitionStatus text NOT NULL, RecognitionReport text NOT NULL, RecognitionPhoto bytea NOT NULL)"))
  .then(() => db.queryScript("CREATE TABLE IF NOT EXISTS dbo.GenerateErrors (Id serial primary key, DistributorID text NOT NULL, RecognitionType text NOT NULL, ActionType text NOT NULL, ErrorCode text NULL, ErrorDescription text NULL, WSClose BOOLEAN DEFAULT false NOT NULL, HTTPStatusCode integer NULL)"))
  .then(() => db.queryScript("INSERT INTO dbo.RecognitionResults (DistributorID, RecognitionStatus, RecognitionReport, RecognitionPhoto) VALUES ($1, $2, $3, $4)", defaultRecResData))
  .then(() => addLogs({"thedate":getNowDate(), "sessionId":"", "status":"GOOD", "messagefrom":"internal_server", "action":"Init DB", "data":"Successful"}, false))
  .catch(function(err){ 
      try {
          addLogs({"thedate":getNowDate(), "sessionId":"", "status":"ERROR", "messagefrom":"internal_server", "action":"Init DB", "data":err}, false);
          console.log(err);
        } 
        catch(err) {
          console.log(err);
        } 
        });
  //Инициализация базы (удаление и создание таблиц)
  
const app = expressWs(express()).app;
app.use(express.static(config.public_path)); 
app.set('port', process.env.PORT || 3000);
app.listen(app.get('port'), () => {
  console.log('Server listening on port %s', app.get('port'));
});

let connects = [];
let siteConnects = [];

app.ws('/onlinereco', (ws, req) => {
    let sessionId = uuidv4();
    ws.sessionId = sessionId;
    connects.push(ws);
    
    db.newSession(sessionId)
    .then(() => addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"client", "action":"NewConnection", "data":JSON.stringify(req.headers)}))
    .catch(function(err){
        addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"client", "action":"NewConnection", "data":err.toString()})
        .then(() => getError(err, 'newConnection', null, sessionId))
        .catch(function(err){
            ws.send('{"type":"error", "data":{"requestType":"newConnection", "errorCode":"ERROR_INTERNAL_SERVER_ERROR", "errorDescription":"'+JSON.stringify(err.data)+'"}}');
            ws.close();
        });
    });


    ws.on('close', () => {
        connects = connects.filter(conn => {
            return (conn === ws) ? false : true;
            });
         
        db.deleteSession (sessionId)
        .then(() => addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"client", "action":"CloseConnection", "data":""}))
        .catch(function(err){
            addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"client", "action":"CloseConnection", "data":err.toString()})
            .then(() => getError(err, 'closeConnection', null, sessionId))
            .catch(function(err){
                ws.send('{"type":"error", "data":{"requestType":"closeConnection", "errorCode":"ERROR_INTERNAL_SERVER_ERROR", "errorDescription":"'+JSON.stringify(err.data)+'"}}');
                ws.close();
            });
        });
      });

    ws.on('message', message => {
        try {
                const jsonMessage = JSON.parse(message);
                switch (jsonMessage.type) {
                    case 'connection':
                        addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"client", "action":"connection", "data":JSON.stringify(jsonMessage)})
                        .then(() => db.updateSession(sessionId, jsonMessage))
                        .then(() => db.checkErrorBySessionID('online', 'connection (global)', sessionId)
                        .then(function(result) {
                            if (result === undefined)
                            {   
                                db.sceneStatuses(sessionId)
                                .then(function(result) {
                                    addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})
                                    ws.send(result);
                                })
                            } else{ 
                                let data = {data:{}};
                                data.type = 'error';
                                data.data.requestType = 'connection';
                                data.data.errorCode = result.errorcode;
                                data.data.errorDescription = result.errordescription;
                                sendMessageWSClient('onlineRecWs', sessionId, JSON.stringify(data), result.wsclose);
                            }
                        }))
                        .catch(function(err){
                                addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"client", "action":"connection", "data":err.toString()})
                                .then(() => getError(err, 'connection', null, sessionId))
                                .catch(function(err){
                                    ws.send('{"type":"error", "data":{"requestType":"connection", "errorCode":"ERROR_INTERNAL_SERVER_ERROR", "errorDescription":"'+JSON.stringify(err.data)+'"}}');
                                    ws.close();
                                });
                            });
                        
                        break;
                    
                    case 'scene':
                        addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"client", "action":"scene", "data":JSON.stringify(jsonMessage)})
                        .then(() => db.checkErrorBySessionID('online', 'scene (global)', sessionId)
                        .then(function(result) {
                            if (result === undefined)
                            {   
                                db.newScene(sessionId, jsonMessage.data.sceneID)
                                .then(() => db.checkErrorBySessionID('online', 'scene (scene)', sessionId)
                                .then(function(result) {
                                    if (result === undefined)
                                        { 
                                            db.sceneStatuses(sessionId)
                                            .then(function(result) {
                                                addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})
                                                ws.send(result);
                                            })
                                        } else{
                                            db.errorScene(jsonMessage.data.sceneID, result.errorcode, result.errordescription)
                                            db.sceneStatuses(sessionId)
                                            .then(function(result) {
                                                addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})
                                                ws.send(result);
                                            })
                                        }
                                }))
                            } else{ 
                                let data = {data:{}};
                                data.type = 'error';
                                data.data.requestType = 'scene';
                                data.data.errorCode = result.errorcode;
                                data.data.errorDescription = result.errordescription;
                                sendMessageWSClient('onlineRecWs', sessionId, JSON.stringify(data), result.wsclose);
                            }
                        }))
                        .catch(function(err){
                                addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"server", "action":"scene", "data":JSON.stringify(err.data)})
                                .then(() => getError(err, 'scene', jsonMessage.data.sceneID, sessionId))
                                .catch(function(err){
                                    console.log(JSON.stringify(err.data));
                                    ws.send('{"type":"error", "data":{"requestType":"scene", "errorCode":"ERROR_INTERNAL_SERVER_ERROR", "errorDescription":"'+JSON.stringify(err.data)+'"}}');
                                    ws.close();
                                });
                            });
                        
                        break;
                    
                    case 'finish':
                        let scenePath = config.new_scene + jsonMessage.data.sceneID + '.rec';
                        let sceneJsonPath = config.new_scene + jsonMessage.data.sceneID + '.json';

                        addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"client", "action":"finish", "data":JSON.stringify(jsonMessage)})
                        .then(() => db.checkErrorBySessionID('online', 'finish (global)', sessionId)
                        .then(function(result) {
                            if (result === undefined)
                            { 
                                db.checkErrorBySessionID('online', 'finish (before processed 2)', sessionId)
                                .then(function(result) {
                                    if (result === undefined)
                                    { 
                                        unzipSceneFile(jsonMessage.data.sceneID, scenePath)
                                        .then(() => deleteFile(scenePath))
                                        .then(() => db.finishNewScene(jsonMessage.data.sceneID, jsonMessage.data.checksum))
                                        .then(() => db.sceneStatuses(sessionId)
                                        .then(function(result) {
                                            addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})     
                                            ws.send(result);
                                            }))
                                        .then(() => db.checkErrorBySessionID('online', 'finish (before processed 3)', sessionId)
                                        .then(function(result) {
                                            if (result === undefined)
                                            { 
                                                getSceneFile(jsonMessage.data.sceneID)
                                                .then(() => sceneRecognizedUpdateStatus(jsonMessage.data.sceneID))
                                                .then(() => deleteFile(sceneJsonPath))
                                                .then(() => sleep(8000))
                                                .then(() => db.sceneStatuses(sessionId)
                                                .then(function(result) {
                                                    addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})     
                                                    ws.send(result);
                                                    }))

                                            } else { 
                                                db.errorScene(jsonMessage.data.sceneID, result.errorcode, result.errordescription)
                                                .then(() => sleep(8000))
                                                .then(() => db.sceneStatuses(sessionId)
                                                .then(function(result) {
                                                    addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})
                                                    ws.send(result);
                                                }))
                                            }
                                        }))

                                    } else{ 
                                        db.errorScene(jsonMessage.data.sceneID, result.errorcode, result.errordescription)
                                        db.sceneStatuses(sessionId)
                                        .then(function(result) {
                                            addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})
                                            ws.send(result);
                                        })
                                    }
                                })
                                
                            } else{ 
                                let data = {data:{}};
                                data.type = 'error';
                                data.data.requestType = 'finish';
                                data.data.errorCode = result.errorcode;
                                data.data.errorDescription = result.errordescription;
                                sendMessageWSClient('onlineRecWs', sessionId, JSON.stringify(data), result.wsclose);
                            }
                        }))
                        .catch(function(err){
                            addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"server", "action":"finish", "data":JSON.stringify(err.data)})
                            .then(() => getError(err, 'finish', jsonMessage.data.sceneID, sessionId))
                            .catch(function(err){
                                console.log(JSON.stringify(err.data));
                                ws.send('{"type":"error", "data":{"requestType":"finish", "errorCode":"ERROR_INTERNAL_SERVER_ERROR", "errorDescription":"'+JSON.stringify(err.data)+'"}}');
                                ws.close();
                            });
                        });

                        break;

                    case 'status':
                        addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"client", "action":"status", "data":JSON.stringify(jsonMessage)})    
                        .then(() => db.checkErrorBySessionID('online', 'status', sessionId)
                        .then(function(result) {
                            if (result === undefined)
                            { 
                                db.sceneStatuses(sessionId)
                                .then(function(result) {
                                    addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})     
                                    ws.send(result);
                                    })
                            } else{
                                db.errorScene(jsonMessage.data.sceneID, result.errorcode, result.errordescription)
                                .then(() => db.sceneStatuses(sessionId)
                                .then(function(result) {
                                    addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})
                                    ws.send(result);
                                }))
                                }
                            }))
                        .catch(function(err){
                            addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"server", "action":"status", "data":JSON.stringify(err.data)})
                            .then(() => getError(err, 'status', jsonMessage.data.sceneID, sessionId))
                            .catch(function(err){
                                console.log(JSON.stringify(err.data));
                                ws.send('{"type":"error", "data":{"requestType":"status", "errorCode":"ERROR_INTERNAL_SERVER_ERROR", "errorDescription":"'+JSON.stringify(err.data)+'"}}');
                                ws.close();
                            });
                        });
                        break;
                    
                    case 'delete':
                        addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"client", "action":"delete", "data":JSON.stringify(jsonMessage)}) 
                        .then(() => db.checkErrorBySessionID('online', 'delete', sessionId)
                        .then(function(result) {
                            if (result === undefined)
                            { 
                                db.deleteScene(sessionId, jsonMessage.data.sceneID)
                                .then(() => db.sceneStatuses(sessionId)
                                .then(function(result) {
                                    addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})     
                                    ws.send(result);
                                    }))
                            } else{
                                db.errorScene(jsonMessage.data.sceneID, result.errorcode, result.errordescription)
                                .then(() => db.sceneStatuses(sessionId)
                                .then(function(result) {
                                    addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})
                                    ws.send(result);
                                }))
                                }
                            }))
                        .catch(function(err){
                            addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"server", "action":"delete", "data":JSON.stringify(err.data)})
                            .then(() => getError(err, 'delete', jsonMessage.data.sceneID, sessionId))
                            .catch(function(err){
                                console.log(JSON.stringify(err.data));
                                ws.send('{"type":"error", "data":{"requestType":"delete", "errorCode":"ERROR_INTERNAL_SERVER_ERROR", "errorDescription":"'+JSON.stringify(err.data)+'"}}');
                                ws.close();
                            });
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

                        db.getAllLogs().then( function(result) {
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
    let scenePath = config.new_scene + req.params.sceneID + '.rec'
    var writeStream = fs.createWriteStream(scenePath);
    req.pipe(writeStream);

    req.on('end', function () {
    
        db.getDistrIdBySceneId(req.params.sceneID)
        .then((result) => db.checkErrorByDistributorID('online', 'putScene', (typeof result !== 'undefined')? result.distributorid:'-1')
        .then(function(result) {
            if (result === undefined)
            {  
                answer(200, 'ok');
            } else{
                answer(result.httpstatuscode, result.errorcode + ' : ' + result.errordescription);
            }   
        }))
        .catch(function(err){
            answer(500, err.toString());
        })
    
    function answer(httpstatuscode, body) {
        res.status(httpstatuscode);
        res.send(body);
        res.end();
      };
    
    });
});
 
app.get('/onlinereco/scene/:sceneID', (req, res) => {
    let scenePath = config.scene_results + req.params.sceneID + '.rec' 
    
    db.getDistrIdBySceneId(req.params.sceneID)
    .then((result) => db.checkErrorByDistributorID('online', 'getScene', (typeof result !== 'undefined')? result.distributorid:'-1')
    .then(function(result) {
        if (result === undefined)
        {  
            answer(200, null, scenePath);
        } else{
            answer(result.httpstatuscode, result.errorcode + ' : ' + result.errordescription);
        }   
    }))
    .catch(function(err){
        answer(500, err.toString());
    })
    
    function answer(httpstatuscode, body, filePath = null) {
        if (filePath !== null) {
            res.download(filePath);
        } else {
            res.status(httpstatuscode);
            res.send(body);
            res.end();
        }
      };

});

app.get('/',(req,res) => {
    res.status(200);
    res.sendFile(config.public_path + 'index.html');
});

app.get('/log',(req,res) => {
    res.status(200);
    res.sendFile(config.public_path + 'log.html');
});

app.get('/recognizedresults',(req,res) => {
    res.status(200);
    res.sendFile(config.public_path + 'recognizedresults.html');
});

app.get('/generateerrors',(req,res) => {
    res.status(200);
    res.sendFile(config.public_path + 'generateErrors.html');
});

app.post('/offlinereco', (req, res) => {
    var busboy = new Busboy({ headers: req.headers });
    let answer = [];
    addLogs({"thedate":getNowDate(), "sessionid":"", "status":"GOOD", "messagefrom":"client", "action":"offlineRecPOST", "data":JSON.stringify(req.headers)})
    
    busboy.on('field', (fieldname, file, filename, encoding, mimetype) => { 
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
                sleep(10000)
                .then(() => unzipSceneFile(sceneIDUpload, config.new_scene + sceneIDUpload+'.rec'))
                .then(() => deleteFile(config.new_scene + sceneIDUpload+'.rec'))
                .then(() => getSceneFile(sceneIDUpload))
                .then(() => deleteFile(config.new_scene + sceneIDUpload+'.json'))
                .then(() => sendPostResult(resulturl, answer, config.scene_results + sceneIDUpload+'.rec', sceneIDUpload))
                .catch(function(err){
                    addLogs({"thedate":getNowDate(), "sessionid":"", "status":"ERROR", "messagefrom":"client", "action":'offlineRec: '+err.type, "data": sceneIDUpload + ' : '+ JSON.stringify(err.data)})
                });
            }
      });
    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
        addLogs({"thedate":getNowDate(), "sessionid":"", "status":"GOOD", "messagefrom":"client", "action":"offlineRecFileUpload", "data":fieldname})
        file.pipe(fs.createWriteStream(config.new_scene + fieldname+'.rec'));
    });
    busboy.on('finish', function() {
      res.setHeader("Content-Type", "application/json");
      res.status(207).json(answer);
      res.end();
    });
    return req.pipe(busboy);
}); 

app.post('/addRecognitionResults', (req, res) => {
    var busboy = new Busboy({ headers: req.headers });
    let resultSettings = {};
    addLogs({"thedate":getNowDate(), "sessionid":"", "status":"GOOD", "messagefrom":"client", "action":"addRecognitionResults", "data":""})
    
    busboy.on('field', (fieldname, file, filename, encoding, mimetype) => { 
        resultSettings[fieldname] = (file==='')? null: file;
      });
    
    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {       
        let name =  (fieldname === 'scenejson') ? 'scene.json' :'scene.jpg';
        file.pipe(fs.createWriteStream(config.new_scene + name));
    });

    busboy.on('finish', function() {
      let report = JSON.parse(fs.readFileSync(config.new_scene + 'scene.json', 'utf8')).report;
      if (report !== 'undefined') {
        let photo = fs.readFileSync(config.new_scene + 'scene.jpg', {encoding:'hex', flag:'r'});
        db.setRecognitionResults(resultSettings.distributorId, resultSettings.recognitionStatusCode, JSON.stringify(report), '\\x' +photo)
        .then(function() { 
            fs.unlinkSync(config.new_scene + 'scene.json');
            fs.unlinkSync(config.new_scene + 'scene.jpg');
        })
        .then(function() { responce({success : true, distributorId : resultSettings.distributorId }); })
        .catch(function(err){
            responce( {success : false, error : err.toString() } );
        });
      } else {
        responce( {success : false, error:'report undefined ' } );
      }

      function responce(answer) {
        res.setHeader("Content-Type", "application/json");
        res.status(201).json(answer);
        res.end();
        }
    });
    return req.pipe(busboy);
}); 

app.post('/getRecognitionResults', (req, res) => {
    var busboy = new Busboy({ headers: req.headers });

    busboy.on('finish', function() {
        db.getRecognitionResults()
        .then(function(result) { 
            responce(200, result);
        })
        .catch(function(err){
            responce(500, {success : false, error : err.toString() } );
        });

        function responce(code, answer) {
            res.setHeader("Content-Type", "application/json");
            res.status(code).json(answer);
            res.end();
            }
    });
    return req.pipe(busboy);
}); 

app.post('/getRecognitionResultsRowDetails', (req, res) => {
    var busboy = new Busboy({ headers: req.headers });
    let resultSettings = {};
    busboy.on('field', (fieldname, file, filename, encoding, mimetype) => { 
        let field = JSON.parse(fieldname);
        if (Object.keys(field)[0] ==='distributorid') {
            resultSettings.distributorid = field.distributorid};
      });
    
      busboy.on('finish', function() {
        db.getResultRowDetails(resultSettings.distributorid)
        .then(function(result) { 
            responce(200, result);
        })
        .catch(function(err){
            responce(500, {success : false, error : err.toString() } );
        });

        function responce(code, answer) {
            res.setHeader("Content-Type", "application/json");
            res.status(code).json(answer);
            res.end();
            }
    });
    return req.pipe(busboy);
}); 

app.post('/deleteRecognitionResultsRow', (req, res) => {
    var busboy = new Busboy({ headers: req.headers });
    let resultSettings = {};
    busboy.on('field', (fieldname, file, filename, encoding, mimetype) => { 
        let field = JSON.parse(fieldname);
        if (Object.keys(field)[0] ==='distributorid') {
            resultSettings.distributorid = field.distributorid};
      });
    
      busboy.on('finish', function() {
        db.deleteResultRow(resultSettings.distributorid)
        .then(function(result) { 
            responce(200, result);
        })
        .catch(function(err){
            responce(500, {success : false, error : err.toString() } );
        });

        function responce(code, answer) {
            res.setHeader("Content-Type", "application/json");
            res.status(code).json(answer);
            res.end();
            }
    });
    return req.pipe(busboy);
}); 

function sleep(timeout) {
    return	new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve('Inside test await');
        }, timeout);
    });
};

function sendPostResult (url, scenes, resultFilePath, sceneID) {
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
        request(uploadOptions, function(err, resp, body) {
            if (err) {
                addLogs({"thedate":getNowDate(), "sessionid":"", "status":"ERROR", "messagefrom":"server", "action":"sendToApi", "data":sceneID + ' : ' + JSON.stringify(uploadOptions) + ' : '+ err.toString()})
            } else {
                addLogs({"thedate":getNowDate(), "sessionid":"", "status":"GOOD", "messagefrom":"server", "action":"sendToApi", "data":sceneID + ' : ' + JSON.stringify(uploadOptions) })
            }
        });
    }); 
}; 

function addLogs(log, send = true) {
    return	new Promise((resolve, reject) => {
       try {
            db.dbAddLog(log)
            .then((result) => {
                if(send) {
                    siteConnects.forEach(socket => {
                        socket.send( JSON.stringify({type:"partialLogs", data:JSON.parse(result)}) );
                        });
                    }
                resolve('LOG added');
                })
            .catch(function(err){ 
                return reject( {type:"addLog", data:err.toString()} )
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

function getError(err, actionType, sceneId = null, sessionId = null) {
    return	new Promise((resolve, reject) => {
        let wsType = 'onlineRecWs';
        let defaultMessage = '{"type":"error", "data":{"requestType":"'+actionType+'", "errorCode":"ERROR_INTERNAL_SERVER_ERROR", "errorDescription":'+JSON.stringify(err.data)+'}}';
        
        switch (actionType) {
            case "newConnection": case "closeConnection": case "connection": 
                sendMessageWSClient(wsType, sessionId, defaultMessage, true);
                return resolve();

            case "sceneStatuses": case "status": 
                sendMessageWSClient(wsType, sessionId, defaultMessage, false);
                return resolve();

            case "delete": 
                switch (err.type) {
                    case 'deleteScene':
                    console.log('deleteScene_1');
                    db.errorScene(sceneId, 'ERROR_INTERNAL_SERVER_ERROR', 'action: delete, err: '+JSON.stringify(err.data))
                    .then(() => db.sceneStatuses(sessionId)
                    .then(function(result) {
                        console.log('deleteScene_3');
                        console.log(result);
                        sendMessageWSClient(wsType, sessionId, result, false);
                        return resolve();
                        }))
                    .catch(function(err){
                        console.log('getError_delete_error', JSON.stringify(err.data));
                        sendMessageWSClient(wsType, sessionId, defaultMessage, true);
                        return reject();
                        });
                        break;

                default:
                    sendMessageWSClient(wsType, sessionId, defaultMessage, true);
                    return resolve();
                }
                
                break;
            
            case "scene": 
                switch (err.type) {
                    case "newScene":
                        db.errorScene(sceneId, 'ERROR_INTERNAL_SERVER_ERROR', 'action: scene, err: '+JSON.stringify(err.data))
                        .then(() => db.sceneStatuses(sessionId))
                        .then(function(result) {
                            sendMessageWSClient(wsType, sessionId, result, true);
                            return resolve();
                            })
                        .catch(function(err){
                            sendMessageWSClient(wsType, sessionId, defaultMessage, true);
                            return reject();
                            });
                        break;
                    
                    default:
                        sendMessageWSClient(wsType, sessionId, defaultMessage, true);
                        return resolve();
                };
               
                break;

            case "finish": 
                switch (err.type) {
                    case 'unzipSceneFile': case 'deleteFile': case 'finishNewScene': case 'getSceneFile': case 'sceneRecognizedUpdateStatus':
                    db.errorScene(sceneId, 'ERROR_INTERNAL_SERVER_ERROR', 'action: finish, err: '+JSON.stringify(err.data))
                    .then(() => db.sceneStatuses(sessionId)
                    .then(function(result) {
                        sendMessageWSClient(wsType, sessionId, result, false);
                        return resolve();
                        }))
                    .catch(function(err){
                        sendMessageWSClient(wsType, sessionId, defaultMessage, true);
                        return reject();
                        });
                        break;

                default:
                    sendMessageWSClient(wsType, sessionId, defaultMessage, true);
                    return resolve();
                }
                
                break;

            default: 
                sendMessageWSClient(wsType, sessionId, defaultMessage, true);
                return resolve();
        }
    });
};

function getDefaultRecResData () {
    return	new Promise((resolve, reject) => {
            try {
                let photo  = fs.readFileSync(config.default_scene_result_path + 'scene.jpg', {encoding:'hex', flag:'r'});
                let report = fs.readFileSync(config.default_scene_result_path + 'report.json', 'utf8');
                let data = [
                    '-1',
                    'RecognizedOk',
                    report,
                    '\\x' +photo
                ]
                return resolve(data);
            } catch(err) {
                return reject( {type:"getDefaultRecData", data:err.toString()} );
            }
        });
};

function sendMessageWSClient (wsType, sessionId, message, close) {
   try {
        if (wsType === 'onlineRecWs')
        {   connects.filter(conn => {
                return (conn.sessionId === sessionId) ? true : false;
            }).forEach(socket => {
                socket.send(message);
                if (close) socket.terminate();
            });
        } else {
            siteConnects.filter(conn => {
                return (conn.siteSessionId === sessionId) ? true : false;
            }).forEach(socket => {
                socket.send(message);
                if (close) socket.terminate();
            });
        }
    } catch (err) {
        console.log('funcSendMessage; ', err)
    }

};



// site Generate Error PAGE

app.post('/getErrors', (req, res) => {
    var busboy = new Busboy({ headers: req.headers });

    busboy.on('finish', function() {
        db.getErrors()
        .then(function(result) { 
            responce(200, result);
        })
        .catch(function(err){
            responce(500, {success : false, error : err.toString() } );
        });

        function responce(code, answer) {
            res.setHeader("Content-Type", "application/json");
            res.status(code).json(answer);
            res.end();
            }
    });
    return req.pipe(busboy);
}); 

app.post('/setError', (req, res) => {
    var busboy = new Busboy({ headers: req.headers });
    let errorData = {};
    
    busboy.on('field', (fieldname, file, filename, encoding, mimetype) => { 
        errorData[fieldname] = (file==='')? null: file;
      });

    busboy.on('finish', function() {
        db.setError(errorData.distributorId, errorData.recognitionType, errorData.actionType, errorData.errorCode, errorData.errorDescription, errorData.httpStatusCode, errorData.wsClose)
        .then(function() { responce({success : true, distributorId : errorData.distributorId }); })
        .catch(function(err){
            responce( {success : false, error : err.toString() } );
        });

      function responce(answer) {
        res.setHeader("Content-Type", "application/json");
        res.status(201).json(answer);
        res.end();
        }
    });
    return req.pipe(busboy);
}); 

app.post('/deleteErrorRow', (req, res) => {
    var busboy = new Busboy({ headers: req.headers });
    let data = {};
    busboy.on('field', (fieldname, file, filename, encoding, mimetype) => { 
        let field = JSON.parse(fieldname);
        if (Object.keys(field)[0] ==='id') {
            data.id = field.id};
      });
    
      busboy.on('finish', function() {
        db.deleteErrorRow(data.id)
        .then(function(result) { 
            responce(200, result);
        })
        .catch(function(err){
            responce(500, {success : false, error : err.toString() } );
        });

        function responce(code, answer) {
            res.setHeader("Content-Type", "application/json");
            res.status(code).json(answer);
            res.end();
            }
    });
    return req.pipe(busboy);
}); 

//