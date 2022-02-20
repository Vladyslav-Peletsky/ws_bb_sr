import {sceneRecognized} from './database.js';
import AdmZip  from 'adm-zip';
import * as fs from 'fs';
import { format } from 'fecha';
import md5 from 'md5';

async function unzipSceneFile(sceneID, scenePath) {
    let sceneFolder = process.cwd()+'/scenes/';
    return	new Promise((resolve, reject) => {
        var zip = new AdmZip(scenePath);
        zip.extractEntryTo(
                "scene.json", 
                sceneFolder, 
                false, 
                true);
        fs.rename(sceneFolder+'scene.json', sceneFolder+sceneID+'.json', () => { console.log("\nFile Renamed!\n"); });
        resolve('unzipSceneFile: '+sceneID);
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


    async function getSceneFile(sceneID) { // creating archives
        return	new Promise((resolve, reject) => {
                  console.log('getSceneFile: ', sceneID);
                  var zip = new AdmZip();
                  // add file directly
                  let sceneFilePath = './scenes/'+sceneID+'.json';
                  let resultSceneFilePath = './scenes/result/'+sceneID+'.rec';
                  let sceneResult = {};
                  let sceneReport = {};
                  let copy = {};
                  
                        function sceneResultFun(sceneFilePath) {
                            return new Promise(function(resolve){
                                sceneResult = JSON.parse(fs.readFileSync(sceneFilePath, 'utf8'));
                                delete sceneResult.report;
                                resolve('sceneResultFun');
                            });
                        };
                        function sceneReportFun() {
                            return new Promise(function(resolve){
                                sceneReport = JSON.parse(fs.readFileSync('./defaultSceneResult/report.json', 'utf8'));                            
                                resolve('sceneReport');
                            });
                        }
                        function copyResults() {
                            return new Promise(function(resolve){
                                copy = Object.assign(sceneReport, sceneResult);
                                //Update data
                                copy.documentRecognitionStatusCode = 'RecognizedOk';
                                copy.metaData.notRecognizePhotosCounter = 0;
                                copy.report.reportDate = format(Date.now(), 'isoDateTime');
                                copy.sceneID = sceneID;
                                zip.addFile("scene.json", Buffer.from(JSON.stringify(copy), "utf8"));
                                zip.addLocalFile("./defaultSceneResult/scene.jpg");  // add local file          
                                zip.writeZip(/*target file name*/ resultSceneFilePath);  // or write everything to disk
                                resolve('zipResults-recognizedStep_1');                            });
                        }
         
                        sceneResultFun(sceneFilePath).then(function(result) {console.log(result)})
                        .then(() => sceneReportFun().then(function(result) { console.log(result)}))
                        .then(() => copyResults().then(function(result) { console.log(result)}));
                               
                        resolve('createResulScene: '+sceneID);
            });          
    }

    async function sceneRecognizedUpdateStatus(sceneID) { // creating archives
        return	new Promise((resolve, reject) => {
            let resultSceneFilePath = './scenes/result/'+sceneID+'.rec';
            let buf = fs.readFileSync(resultSceneFilePath)
            let md5hash = md5(buf);
            sceneRecognized(sceneID, md5hash.toUpperCase())
            console.log('recognizedStep_2');
            
        resolve('sceneRecognizedUpdateStatus: '+sceneID);
        });   
    }

export {unzipSceneFile, deleteFile, getSceneFile, sceneRecognizedUpdateStatus};