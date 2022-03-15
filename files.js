import {sceneRecognized} from './database.js';
import AdmZip  from 'adm-zip';
import * as fs from 'fs';
import { format } from 'fecha';
import md5 from 'md5';

async function unzipSceneFile(sceneID, scenePath) {
    return	new Promise((resolve, reject) => {
        try {
            let sceneFolder = process.cwd()+'/scenes/';
            var zip = new AdmZip(scenePath);
            zip.extractEntryTo("scene.json", sceneFolder, false, true);
            fs.rename(sceneFolder+'scene.json', sceneFolder+sceneID+'.json', () => { console.log("\nFile Renamed!\n"); });
            return resolve('unzipSceneFile: '+sceneID); 
        }
        catch(err) {
            if (err) return reject( {type:"unzipSceneFile", data:err.toString()} );
        }
    });  
  };

async function deleteFile(scenePath) {
    return	new Promise((resolve, reject) => {
        fs.unlink(scenePath, function (err) {
            if (err) {
                return reject( {type:"deleteFile", data:err.toString()} );
            } else {
                return resolve('deleteFile: '+scenePath); 
            }
        });
    });
  };


async function getSceneFile(sceneID) { // creating archives
    return	new Promise((resolve, reject) => {
        let sceneFilePath = './scenes/'+sceneID+'.json';
        let sceneResult = {};
        let sceneReport = {};
                  
        sceneResultFun(sceneFilePath)
        .then(function(result) { sceneResult = result })
        .then(() => sceneReportFun()
        .then(function(result) { sceneReport = result }))
        .then(() => copyResults( sceneReport, sceneResult, sceneID )
        .then(function() { 
            return resolve('createResultScene: '+sceneID); 
        }))
        .catch(function(err){
            console.log('ERROR createResultScene');
            console.log(err);
            return reject( {type:"getSceneFile", data:err.toString()} );
        });
                               
                        
    });          
  };

function sceneResultFun(sceneFilePath) {
    return	new Promise((resolve, reject) => {
        try {
            let sceneResult = {};
            sceneResult = JSON.parse(fs.readFileSync(sceneFilePath, 'utf8'));
            delete sceneResult.report;
            return resolve(sceneResult);
        }
        catch(err) {
            return reject( {type:"sceneResultFun", data:err.toString()} );
        }
      });
  };

function sceneReportFun() {
    return	new Promise((resolve, reject) => {
        try {
            let sceneReport = {};
            sceneReport = JSON.parse(fs.readFileSync('./defaultSceneResult/report.json', 'utf8')); 
            return resolve(sceneReport);
        }
        catch(err) {
            return reject( {type:"sceneReportFun", data:err.toString()} );
        }
      });
  };

function copyResults(sceneReport, sceneResult, sceneID) {
    return	new Promise((resolve, reject) => {
        try {
            var zip = new AdmZip();
            let copy = {};
            copy = Object.assign(sceneReport, sceneResult);
            copy.documentRecognitionStatusCode = 'RecognizedOk';
            copy.metaData.notRecognizePhotosCounter = 0;
            copy.report.reportDate = format(Date.now(), 'isoDateTime');
            copy.sceneID = sceneID;
            zip.addFile("scene.json", Buffer.from(JSON.stringify(copy), "utf8"));
            zip.addLocalFile("./defaultSceneResult/scene.jpg");  // add local file          
            zip.writeZip(getResultSceneFilePatch(sceneID));      // or write everything to disk
            return resolve('zipResults-recognizedStep_1');
        }
        catch(err) {
            return reject( {type:"zipResults", data:err.toString()} );
        }
      });
  };

function sceneRecognizedUpdateStatus(sceneID) { // creating archives
    return	new Promise((resolve, reject) => {
        try {
            let buf = fs.readFileSync(getResultSceneFilePatch(sceneID))
            let md5hash = md5(buf);
            sceneRecognized(sceneID, md5hash.toUpperCase())
            return resolve('sceneRecognizedUpdateStatus');
        }
        catch(err) {
            return reject( {type:"sceneRecognizedUpdateStatus", data:err.toString()} );
        }
        
    });   
  };

function getResultSceneFilePatch(sceneID) {
    return './scenes/result/'+sceneID+'.rec'
  };
    


export {unzipSceneFile, deleteFile, getSceneFile, sceneRecognizedUpdateStatus};