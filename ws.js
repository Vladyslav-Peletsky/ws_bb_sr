import {WebSocketServer}  from 'ws';
import {newSession, updateSession, deleteSession, newScene, finishNewScene, sceneRecognized, finishSendScene, deleteScene, sceneStatuses} from './database.js';
import { v4 as uuidv4 } from 'uuid';
import AdmZip  from 'adm-zip';
import * as fs from 'fs';
import { format } from 'fecha';
import isUtf8 from 'is-utf8';
import md5 from 'md5';



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
                        newScene(clientId, jsonMessage.data.sceneID, jsonMessage.data.length)
                        .then(() => sceneStatuses(clientId)).then(function(result) {
                            wsClient.send(result);
                            });
                        console.log('newScene');
                        break;
                    case 'finish':
                    if (global.currentSceneId = jsonMessage.data.sceneID) {  
                            let scenePath = process.cwd()+'/scenes/'+global.currentSceneId+'.rec'
                            let sceneFolder = process.cwd()+'/scenes/'
                            
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
                                    fs.rename(sceneFolder+'scene.json', sceneFolder+global.currentSceneId+'.json', () => {
                                        console.log("\nFile Renamed!\n");
                                      });
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

                            async function clearGlobalVariables() {
                                return	new Promise((resolve, reject) => {
                                    global.result = new Uint8Array();
                                    global.currentSceneId = null;
                                    console.log('clear global');
                                    console.log(global.result);
                                    console.log(global.currentSceneId);
                                    resolve('clearGlobalVariables - done');
                                });
                            }
                            
                           

                        createSceneFile().then(function(result) {console.log(result)})
                        .then(unzipSceneFile).then(function(result) {console.log(result)})
                        .then(deleteSceneFile).then(function(result) {console.log(result)})
                        .then(clearGlobalVariables).then(function(result) {console.log(result)})
                        .then(() => finishNewScene(clientId, jsonMessage.data.sceneID, jsonMessage.data.checksum).then(function(result) { console.log(result)}))
                        .then(() => sceneStatuses(clientId)).then(function(result) {wsClient.send(result)})
                        .then(() => sleep(4000)).then(function(result) {console.log(result)})
                        .then(() => getSceneFile(jsonMessage.data.sceneID)).then(function(result) {console.log(result)})
                        .then(() => sceneRecognizedUpdateStatus(jsonMessage.data.sceneID)).then(function(result) {console.log(result)})
                        .then(() => sleep(1000)).then(function(result) {console.log(result)})
                        .then(() => sceneStatuses(clientId)).then(function(result) {wsClient.send(result)});
                        
                        } else
                        {
                            console.log('finish - ид сцен не совпали')
                        }
                        console.log('finishNewScene');
                        break;
                    case 'get':
                        console.log('get');
                        
                        let resultSceneFilePath = './scenes/result/'+jsonMessage.data.sceneID+'.rec';
                        
                        fs.createReadStream(resultSceneFilePath, {bufferSize: 100 * 1024})
                        .on("data", function(chunk){ 
                                wsClient.send(chunk);
                                console.log(chunk);
                                })
                        .on('end', function () {
                            sleep(1000)  
                            .then(() => finishSendScene(jsonMessage.data.sceneID)).then(function(result) {
                                        wsClient.send(result);
                                    }); 
                                console.log('{"type":"finish","data":{"sceneID":"'+jsonMessage.data.sceneID+'"}}');
                                });
                        

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
            let length = fs.statSync(resultSceneFilePath);
            sceneRecognized(sceneid, length.size, md5hash.toUpperCase())
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
    }

console.log('Сервер запущен на 9000 порту');

export {onConnect};



