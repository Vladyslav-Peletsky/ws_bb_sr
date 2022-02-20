import {createTables,dropTables, newSession, updateSession, deleteSession, newScene, finishNewScene, deleteScene, sceneStatuses} from './database.js';
import {unzipSceneFile, deleteFile, getSceneFile, sceneRecognizedUpdateStatus} from './files.js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import express from 'express';
import expressWs from 'express-ws';
import Busboy from 'busboy';
import request from 'request';

dropTables();
setTimeout(createTables, 1000); 

const app = expressWs(express()).app;
app.set('port', process.env.PORT || 3000);
app.listen(app.get('port'), () => {
  console.log('Server listening on port %s', app.get('port'));
});

let connects = [];

app.ws('/onlinereco', (ws, req) => {
    connects.push(ws);
    let clientId = uuidv4();
    console.log('Новый пользователь: '+clientId);
    newSession (clientId);

    ws.on('close', () => {
        console.log('Пользователь отключился: ', clientId);
        deleteSession (clientId);
            connects = connects.filter(conn => {
            return (conn === ws) ? false : true;
            });
      });

    ws.on('message', message => {
        try {
                const jsonMessage = JSON.parse(message);
                switch (jsonMessage.type) {
                    case 'connection':
                        updateSession(clientId, jsonMessage)
                        .then(() => sceneStatuses(clientId)).then(function(result) {
                            connects.forEach(socket => {
                                socket.send(result);
                                });
                            });
                        console.log('connection. clientId: ', clientId);
                        break;
                    
                    case 'scene':
                        newScene(clientId, jsonMessage.data.sceneID)
                        .then(() => sceneStatuses(clientId)).then(function(result) {
                            connects.forEach(socket => {
                                 socket.send(result);
                                });
                            });
                        console.log('newScene, clientId: ',clientId, ' sceneID: ', jsonMessage.data.sceneID);
                        break;
                    
                    case 'finish':
                        let scenePath = process.cwd()+'/scenes/'+jsonMessage.data.sceneID+'.rec';
                        let sceneJsonPath = process.cwd()+'/scenes/'+jsonMessage.data.sceneID+'.json';
                        unzipSceneFile(jsonMessage.data.sceneID, scenePath).then(function(result) {console.log(result)})
                        .then(() => deleteFile(scenePath).then(function(result) { console.log(result)}))
                        .then(() => finishNewScene(jsonMessage.data.sceneID, jsonMessage.data.checksum).then(function(result) { console.log(result)}))
                        .then(() => sceneStatuses(clientId)).then(function(result) {
                            connects.forEach(socket => {
                                socket.send(result);
                               });
                        })
                        .then(() => sleep(2000)).then(function(result) {console.log(result)})
                        .then(() => getSceneFile(jsonMessage.data.sceneID)).then(function(result) {console.log(result)})
                        .then(() => sleep(4000)).then(function(result) {console.log(result)})
                        .then(() => sceneRecognizedUpdateStatus(jsonMessage.data.sceneID)).then(function(result) {console.log(result)})
                        .then(() => sleep(6000)).then(function(result) {console.log(result)})
                        .then(() => deleteFile(sceneJsonPath).then(function(result) { console.log(result)}))
                        .then(() => sleep(8000)).then(function(result) {console.log(result)})
                        .then(() => sceneStatuses(clientId)).then(function(result) {
                            connects.forEach(socket => {
                                socket.send(result);
                               });
                        });
                        console.log('finishNewScene, clientId: ',clientId, ' sceneID: ', jsonMessage.data.sceneID);
                        break;

                    case 'status':
                        sceneStatuses(clientId).then(function(result) {
                            connects.forEach(socket => {
                                socket.send(result);
                               });
                        });
                        console.log('status, clientId: ',clientId);
                        break;
                    
                    case 'delete':
                        deleteScene(clientId, jsonMessage.data.sceneID)
                        .then(() => sceneStatuses(clientId)).then(function(result) {
                            connects.forEach(socket => {
                                socket.send(result);
                               });
                            });
                        console.log('delete, clientId: ',clientId);
                        break;
                    default:
                        console.log('Неизвестная команда '+jsonMessage.type, ' clientId: ',clientId);
                        break;
                }
            } catch (error) {
                console.log('Ошибка: ', error);
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
                .then(() => unzipSceneFile(sceneIDUpload, './scenes/scenesOffline/'+sceneIDUpload+'.rec').then(function(result) {console.log(result)}))
                .then(() => deleteFile('./scenes/scenesOffline/'+sceneIDUpload+'.rec').then(function(result) { console.log(result)}))
                .then(() => sleep(6000)).then(function(result) {console.log(result)})
                .then(() => getSceneFile(sceneIDUpload)).then(function(result) {console.log(result)})
                .then(() => sleep(4000)).then(function(result) {console.log(result)})
                .then(() => sendPostResult(resulturl, answer, './scenes/result/'+sceneIDUpload+'.rec', sceneIDUpload)).then(function(result) {console.log(result)})
            }

      });
    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
        console.log('file: '+JSONstringify(fieldname));
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

  //таймаут
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
