import {WebSocketServer}  from 'ws';
import {newSession, updateSession, deleteSession, newScene, finishNewScene, sceneRecognized, deleteScene, sceneStatuses} from './database.js';
import { v4 as uuidv4 } from 'uuid';
import AdmZip  from 'adm-zip';
import * as fs from 'fs';
import { format } from 'fecha';
import isUtf8 from 'is-utf8';


const PORT = process.env.PORT || 5000;
const wsServer = new WebSocketServer({ port: PORT });
global.currentSceneId;
global.result = new Uint8Array();

wsServer.on('connection', onConnect);
function onConnect(wsClient) {
    let clientId = uuidv4();
    console.log('Новый пользователь '+clientId);
    newSession (clientId);

    wsClient.on('close', function() {
        console.log('Пользователь отключился'+clientId);
        deleteSession (clientId);
    });

    wsClient.on('message', function(message) {
        if (isUtf8(message)) {
                try {
                const jsonMessage = JSON.parse(message);
                switch (jsonMessage.type) {
                    case 'connection':
                        updateSession(clientId, jsonMessage)
                        .then(() => sceneStatuses(clientId)).then(function(result) {
                            wsClient.send(result);
                            });
                        console.log('connection');
                        break;
                    case 'scene':
                        global.currentSceneId = jsonMessage.data.sceneID;
                        newScene(clientId, jsonMessage.data.sceneID)
                        .then(() => sceneStatuses(clientId)).then(function(result) {
                            wsClient.send(result);
                            });
                        console.log('newScene');
                        break;
                    case 'finish':
                    if (global.currentSceneId = jsonMessage.data.sceneID) {  
                            let scenePath = process.cwd()+'/scenes/'+global.currentSceneId+'.rec'
                            let sceneFolder = process.cwd()+'/scenes/'+global.currentSceneId
                            
                            if (!fs.existsSync(process.cwd()+'/scenes')){
                                fs.mkdirSync(process.cwd()+'/scenes');
                            }
                            
                            async function createSceneFile() {
                                console.log(global.result);
                                return	new Promise((resolve, reject) => {
                                    fs.writeFileSync(scenePath, global.result)
                                        resolve('createSceneFile: '+global.currentSceneId);
                                    
                                    });
                            }
                            async function unzipSceneFile() {
                                return	new Promise((resolve, reject) => {
                                    var zip = new AdmZip(scenePath);
                                    zip.extractEntryTo(
                                            "scene.json", 
                                            sceneFolder, 
                                            /*maintainEntryPath*/ false, 
                                            /*overwrite*/ true);
                                    resolve('unzipSceneFile: '+global.currentSceneId);
                                        });
                            }
                            async function deleteSceneFile() {
                                return	new Promise((resolve, reject) => {
                                    fs.unlink(scenePath, function (err) {
                                        if (err) {
                                            reject(err);
                                        } else {
                                            resolve('deleteSceneFile: '+global.currentSceneId);
                                        }
                                    }); //удаление полученной сцены
                                });
                            }

                        createSceneFile().then(function(result) {console.log(result)})
                        .then(unzipSceneFile).then(function(result) {console.log(result)})
                        .then(deleteSceneFile).then(function(result) {console.log(result)})
                        
                        global.result = new Uint8Array();
                        global.currentSceneId = null;
                        console.log('clear global');
                        console.log(global.result);
                        console.log(global.currentSceneId);
                            
                        finishNewScene(clientId, jsonMessage.data.sceneID)
                        .then(() => sceneStatuses(clientId)).then(function(result) {
                            wsClient.send(result);
                            });    
                        
                        //таймаут
                        async function sleep() {
                            return	new Promise((resolve, reject) => {
                                setTimeout(() => {
                                    resolve('Inside test await');
                                }, 10000);
                            });
                        }
                        
                        sleep()
                        .then(() => sceneRecognized(clientId, jsonMessage.data.sceneID))
                        .then(() => sceneStatuses(clientId)).then(function(result) {
                            wsClient.send(result);
                            }); 
                        
                        } else
                        {
                            console.log('finish - ид сцен не совпали')
                        }
                        console.log('finishNewScene');
                        break;
                    case 'get':
                        console.log('get');
                        getSceneFile(jsonMessage.data.sceneID);
                       
                        let resultSceneFilePath = './scenes/'+jsonMessage.data.sceneID+'/result/'+jsonMessage.data.sceneID+'.rec';

                        var resultRec = fs.readFileSync(resultSceneFilePath);
                        for (var i = 0; i < resultRec.length; ++i) {
                            resultRec[i] = i / 2;
                        }
                        wsClient.send(resultRec);

                        break;
                    case 'status':
                        sceneStatuses(clientId).then(function(result) {
                            wsClient.send(result);
                        });
                        console.log('status');
                        break;
                    case 'delete':
                        deleteScene(clientId, jsonMessage.data.sceneID)
                        .then(() => sceneStatuses(clientId)).then(function(result) {
                            wsClient.send(result);
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
        } else {
            var buf = new Uint8Array(message);
            console.log('start send file - '+ global.currentSceneId);
            global.result = Buffer.concat([global.result,buf]);
        }
    });
}
 
function getSceneFile(sceneid) { // creating archives
                  var zip = new AdmZip();
                  // add file directly
                  let sceneFilePath = './scenes/'+sceneid+'/scene.json';
                  let resultSceneFilePath = './scenes/'+sceneid+'/result/'+sceneid+'.rec';
                  let dirResult = './scenes/'+sceneid+'/result';
                  
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
                  
                }

console.log('Сервер запущен на 9000 порту');

export {onConnect};



