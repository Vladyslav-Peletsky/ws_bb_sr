import {sceneRecognized} from './database.js';
import AdmZip  from 'adm-zip';
import * as fs from 'fs';
import { format } from 'fecha';
import md5 from 'md5';

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
                  let copy = {};
                  setTimeout(copyScenesResults, 3000); 
                  
                  function copyScenesResults() {
                      copy = Object.assign(sceneReport, sceneResult);
                      //Update data
                        copy.documentRecognitionStatusCode = 'RecognizedOk';
                        copy.metaData.notRecognizePhotosCounter = 0;
                        copy.report.reportDate = format(Date.now(), 'isoDateTime');
                        copy.sceneID = sceneid;
                  
                        zip.addFile("scene.json", Buffer.from(JSON.stringify(copy), "utf8"));
                        
                        zip.addLocalFile("./defaultSceneResult/scene.jpg");  // add local file
                                        
                        zip.writeZip(/*target file name*/ resultSceneFilePath);  // or write everything to disk
                        console.log('recognizedStep_1');
                    };
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

export {unzipSceneFile, deleteFile, getSceneFile, sceneRecognizedUpdateStatus};