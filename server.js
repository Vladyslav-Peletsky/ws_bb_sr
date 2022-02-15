import {createTables,dropTables, newSession, updateSession, deleteSession, newScene, finishNewScene, sceneRecognized, deleteScene, sceneStatuses} from './database.js';
import { v4 as uuidv4 } from 'uuid';
import AdmZip  from 'adm-zip';
import * as fs from 'fs';
import { format } from 'fecha';
import md5 from 'md5';

import express from 'express';
import expressWs from 'express-ws';

dropTables();
setTimeout(createTables, 1000); 


const app = expressWs(express()).app;
app.set('port', process.env.PORT || 3000);
app.listen(app.get('port'), () => {
  console.log('Server listening on port %s', app.get('port'));
});

let connects = [];

global.currentSceneId;
global.result = new Uint8Array();

app.ws('/onlinereco', (ws, req) => {
    connects.push(ws);
    let clientId = uuidv4();
    console.log('Новый пользователь '+clientId);
    newSession (clientId);

    ws.on('close', () => {
        console.log('Пользователь отключился'+clientId);
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
                        console.log('connection');
                        break;
                    
                    case 'scene':
                        global.currentSceneId = jsonMessage.data.sceneID;
                        newScene(clientId, jsonMessage.data.sceneID)
                        .then(() => sceneStatuses(clientId)).then(function(result) {
                            connects.forEach(socket => {
                                 socket.send(result);
                                });
                            });
                        console.log('newScene');
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
                        .then(() => sleep(4000)).then(function(result) {console.log(result)})
                        .then(() => getSceneFile(jsonMessage.data.sceneID)).then(function(result) {console.log(result)})
                        .then(() => sceneRecognizedUpdateStatus(jsonMessage.data.sceneID)).then(function(result) {console.log(result)})
                        .then(() => deleteFile(sceneJsonPath).then(function(result) { console.log(result)}))
                        .then(() => sleep(1000)).then(function(result) {console.log(result)})
                        .then(() => sceneStatuses(clientId)).then(function(result) {
                            connects.forEach(socket => {
                                socket.send(result);
                               });
                        });
                        console.log('finishNewScene');
                        break;

                    case 'status':
                        sceneStatuses(clientId).then(function(result) {
                            socket.send(result);
                        });
                        console.log('status');
                        break;
                    
                    case 'delete':
                        deleteScene(clientId, jsonMessage.data.sceneID)
                        .then(() => sceneStatuses(clientId)).then(function(result) {
                            socket.send(result);
                            });
                        console.log('delete');
                        break;
                    default:
                        console.log('Неизвестная команда '+jsonMessage.type);
                        break;
                }
            } catch (error) {
                console.log('Ошибка', error);
            }
        
    });
});


app.put('/onlinereco/scene/:sceneid', (req, res) => {
        let scenePath = process.cwd()+'/scenes/'+req.params.sceneid+'.rec'
        
        var writeStream = fs.createWriteStream(scenePath);
        req.pipe(writeStream);
        req.on('end', function () {
        res.send('ok');
        });
  });
 
  app.get('/onlinereco/scene/:sceneid', (req, res) => {
        let scenePath = process.cwd()+'/scenes/'+req.params.sceneid+'.rec' 
        res.download(scenePath);
  });


  async function unzipSceneFile(sceneid, scenePath) {
    let sceneFolder = process.cwd()+'/scenes/';
    return	new Promise((resolve, reject) => {
        var zip = new AdmZip(scenePath);
        zip.extractEntryTo(
                "scene.json", 
                sceneFolder, 
                false, 
                true);
        fs.rename(sceneFolder+'scene.json', sceneFolder+sceneid+'.json', () => { console.log("\nFile Renamed!\n"); });
        resolve('unzipSceneFile: '+sceneid);
            });  
    }

    async function deleteFile(scenePath) {
        return	new Promise((resolve, reject) => {
            fs.unlink(scenePath, function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve('deleteFile: '+scenePath);
                }
            });
        });
    }


    async function getSceneFile(sceneid) { // creating archives
        return	new Promise((resolve, reject) => {
                  console.log('recognizedStep_0');
                  var zip = new AdmZip();
                  // add file directly
                  let sceneFilePath = './scenes/'+sceneid+'.json';
                  let resultSceneFilePath = './scenes/result/'+sceneid+'.rec';
                  let dirResult = './scenes/result';
                  
                  if (!fs.existsSync(dirResult)){
                    fs.mkdirSync(dirResult);
                  }
                  //var content = "inner content of the file";

                  let sceneResult = JSON.parse(fs.readFileSync(sceneFilePath, 'utf8'));
                  let sceneReport = JSON.parse(fs.readFileSync('./defaultSceneResult/report.json', 'utf8'))
                  let copy = Object.assign(sceneReport, sceneResult);
                  //Update data
                  copy.documentRecognitionStatusCode = 'RecognizedOk';
                  copy.metaData.notRecognizePhotosCounter = 0;
                  copy.report.reportDate = format(Date.now(), 'isoDateTime');
                  copy.sceneID = sceneid;

                  zip.addFile("scene.json", Buffer.from(JSON.stringify(copy), "utf8"));
                 
                  zip.addLocalFile("./defaultSceneResult/scene.jpg");  // add local file
                                  
                  zip.writeZip(/*target file name*/ resultSceneFilePath);  // or write everything to disk
                  console.log('recognizedStep_1');

            resolve('createResulScene: '+sceneid);
            });          
    }

    async function sceneRecognizedUpdateStatus(sceneid) { // creating archives
        return	new Promise((resolve, reject) => {
            let resultSceneFilePath = './scenes/result/'+sceneid+'.rec';
            let buf = fs.readFileSync(resultSceneFilePath)
            let md5hash = md5(buf);
            sceneRecognized(sceneid, md5hash.toUpperCase())
            console.log('recognizedStep_2');
            
        resolve('sceneRecognizedUpdateStatus: '+sceneid);
        });   
    }

     //таймаут
     async function sleep(timeout) {
        return	new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve('Inside test await');
            }, timeout);
        });
    };
