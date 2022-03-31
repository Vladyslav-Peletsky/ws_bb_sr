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
  .then(() => db.queryScript("CREATE SCHEMA IF NOT EXISTS dbo"))
  .then(() => db.queryScript("CREATE TABLE IF NOT EXISTS dbo.Logs (Id serial primary key, TheDate text NULL, SessionID uuid NULL, Status text NULL, MessageFrom text, Action text, Data text)"))
  .then(() => db.queryScript("CREATE TABLE IF NOT EXISTS dbo.Scenes (SceneID uuid UNIQUE NOT NULL, Processed integer NOT NULL, PutUrl text, GetUrl text, Checksum text NULL, isActive int NOT NULL, DistributorID text NOT NULL, VisitID text NOT NULL, DocumentID text NOT NULL, CustomerID text NOT NULL, EmployeeID text NOT NULL, Custom text NULL)"))
  .then(() => db.queryScript("CREATE TABLE IF NOT EXISTS dbo.ClientSessions (SessionID uuid NOT NULL, isActive integer, DistributorID text NULL, VisitID text NULL, DocumentID text NULL, CustomerID text NULL, EmployeeID text NULL, Custom text NULL, CreateDate timestamp without time zone NOT NULL, UpdatedDate timestamp without time zone NOT NULL)"))
  .then(() => db.queryScript("CREATE TABLE IF NOT EXISTS dbo.RecognitionResults (DistributorID text UNIQUE NOT NULL, RecognitionStatus text NOT NULL, RecognitionReport text NOT NULL, RecognitionPhoto bytea NOT NULL)"))
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
    
    db.newSession(sessionId)
    .then(() => addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"client", "action":"NewConnection", "data":JSON.stringify(req.headers)}))
    .catch(function(err){
        try {
            addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"client", "action":"NewConnection", "data":err.toString()})
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
         
        db.deleteSession (sessionId)
        .then(() => addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"client", "action":"CloseConnection", "data":""}))
        .catch(function(err){
            try {
                addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"ERROR", "messagefrom":"server", "action":"CloseConnection", "data":err.toString()})
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
                        .then(() => db.updateSession(sessionId, jsonMessage))
                        .then(() => db.sceneStatuses(sessionId))
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
                        .then(() => db.newScene(sessionId, jsonMessage.data.sceneID))
                        .then(() => db.sceneStatuses(sessionId))
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
                        let scenePath = config.new_scene + jsonMessage.data.sceneID + '.rec';
                        let sceneJsonPath = config.new_scene + jsonMessage.data.sceneID + '.json';

                        addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"client", "action":"finish", "data":JSON.stringify(jsonMessage)})    
                        .then(() => unzipSceneFile(jsonMessage.data.sceneID, scenePath))
                        .then(() => deleteFile(scenePath))
                        .then(() => db.finishNewScene(jsonMessage.data.sceneID, jsonMessage.data.checksum))
                        .then(() => db.sceneStatuses(sessionId)
                        .then(function(result) {
                            addLogs({"thedate":getNowDate(), "sessionid":sessionId, "status":"GOOD", "messagefrom":"server", "action":"sceneStatuses", "data":result})     
                            ws.send(result);
                            }))
                        .then(() => getSceneFile(jsonMessage.data.sceneID))
                        .then(() => sceneRecognizedUpdateStatus(jsonMessage.data.sceneID))
                        .then(() => deleteFile(sceneJsonPath))
                        .then(() => sleep(8000))
                        .then(() => db.sceneStatuses(sessionId)
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
                    .then(() => db.sceneStatuses(sessionId)
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
                        .then(() => db.deleteScene(sessionId, jsonMessage.data.sceneID))
                        .then(() => db.sceneStatuses(sessionId)
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
    res.send('ok');
    res.end();
    });
});
 
app.get('/onlinereco/scene/:sceneID', (req, res) => {
    let scenePath = config.scene_results + req.params.sceneID + '.rec' 
    res.download(scenePath);
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
                    console.log(err);
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
        if (fieldname ==='distributorId') {resultSettings.distributorId = file} else if (fieldname ==='recognitionStatusCode') {resultSettings.recognitionStatusCode = file}
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
        var req = request(uploadOptions, function(err, resp, body) {
            if (err) {
                addLogs({"thedate":getNowDate(), "sessionid":"", "status":"ERROR", "messagefrom":"server", "action":"sendToApi", "data":sceneID + ' : '+ err.toString()})
            } else {
                addLogs({"thedate":getNowDate(), "sessionid":"", "status":"GOOD", "messagefrom":"server", "action":"sendToApi", "data":sceneID})
            }
        });
    }); 
}; 

function addLogs(log, send = true) {
    return	new Promise((resolve, reject) => {
       try {
            db.dbAddLog(log)
            .then(() => {
                if(send) {
                    siteConnects.forEach(socket => {
                        socket.send( JSON.stringify({type:"partialLogs", data:[log]}) );
                        });
                    }
                resolve('LOG added');
                })
            .catch(function(err){ 
                console.log(err);
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