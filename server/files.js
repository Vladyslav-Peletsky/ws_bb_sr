import {config} from './config/config.js';
import * as db from './database.js';
import AdmZip  from 'adm-zip';
import * as fs from 'fs';
import { format } from 'fecha';
import md5 from 'md5';

function unzipSceneFile(sceneID, scenePath) {
    return	new Promise((resolve, reject) => {
        console.log('unzipSceneFile', sceneID, scenePath)
        try {
            let sceneFolder = config.new_scene;
            var zip = new AdmZip(scenePath);
            zip.extractEntryTo("scene.json", sceneFolder, false, true);
            fs.renameSync( sceneFolder + 'scene.json', sceneFolder + sceneID + '.json' );
            return resolve('unzipSceneFile: '+sceneID); 
        }
        catch(err) {
            console.log({type:"unzipSceneFile", data:err.toString()});
            if (err) return reject( {type:"unzipSceneFile", data:err.toString()} );
        }
    });  
  };

function deleteFile(scenePath) {
    return	new Promise((resolve, reject) => {
        console.log('deleteFile', scenePath)
        fs.unlink(scenePath, function (err) {
            if (err) {
                return reject( {type:"deleteFile", data:err.toString()} );
            } else {
                return resolve('deleteFile: '+scenePath); 
            }
        });
    });
  };

function getSceneFile(sceneID) { // creating archives
    console.log('getSceneFile');
    return	new Promise((resolve, reject) => {
        let sceneFilePath = config.new_scene + sceneID+'.json';
        let sceneResult = {};
        let sceneReport = {};
        let bufPhoto;
                  
        sceneResultFun(sceneFilePath)
        .then(function(result) { sceneResult = result })
        .then(() => db.getResultReport((sceneResult.distributorID === 'undefined')? '-1': sceneResult.distributorID)
        .then(function(result) { sceneReport.report = JSON.parse(result) }))
        .then(() => db.getResultPhoto((sceneResult.distributorID === 'undefined')? '-1': sceneResult.distributorID)
        .then(function(result) { 
            if (typeof Buffer.from === "function") {
                bufPhoto = Buffer.from(result, 'base64');
            } else {
                // older Node versions, now deprecated
                bufPhoto = new Buffer(result, 'base64');
            }
        }))
        .then(() => copyResults( sceneReport, sceneResult, bufPhoto, sceneID)
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

function copyResults(sceneReport, sceneResult, bufPhoto, sceneID) {
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
            zip.addFile("scene.jpg", bufPhoto);
            zip.writeZip(config.scene_results + sceneID + '.rec');      // or write everything to disk
            return resolve('zipResults-recognizedStep_1');
        }
        catch(err) {
            return reject( {type:"zipResults", data:err.toString()} );
        }
      });
};

function sceneRecognizedUpdateStatus(sceneID) { // creating archives
    return	new Promise((resolve, reject) => {
        let buf = fs.readFileSync(config.scene_results + sceneID+ '.rec')
        let md5hash = md5(buf);

        db.sceneRecognized(sceneID, md5hash.toUpperCase())
        .then(() => {return resolve('sceneRecognizedUpdateStatus');})
        .catch((err) => {return reject( {type:"sceneRecognizedUpdateStatus", data:err.toString()} );})
    });   
};

export {unzipSceneFile, deleteFile, getSceneFile, sceneRecognizedUpdateStatus};