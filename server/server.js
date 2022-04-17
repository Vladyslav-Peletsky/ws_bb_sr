import { config } from './config/config.js';
import * as db from './database.js';
import { unzipSceneFile, deleteFile, getSceneFile, sceneRecognizedUpdateStatus } from './files.js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import express, { json } from 'express';
import expressWs from 'express-ws';
import Busboy from 'busboy';
import request from 'request';
import { format } from 'fecha';
import dateFormat, { masks } from "dateformat";


//Инициализация базы (удаление и создание таблиц)
let defaultRecResData = [];
getDefaultRecResData().then(function (result) { defaultRecResData = result; })
    .then(() => db.queryScript("DROP TABLE IF EXISTS dbo.Logs"))
    .then(() => db.queryScript("DROP TABLE IF EXISTS dbo.Scenes"))
    .then(() => db.queryScript("DROP TABLE IF EXISTS dbo.ClientSessions"))
    //.then(() => db.queryScript("DROP TABLE IF EXISTS dbo.RecognitionResults"))
    .then(() => db.queryScript("DROP TABLE IF EXISTS dbo.GenerateErrors"))
    .then(() => db.queryScript("CREATE SCHEMA IF NOT EXISTS dbo"))
    .then(() => db.queryScript("CREATE TABLE IF NOT EXISTS dbo.Logs (Id serial primary key, TheDate timestamp NOT NULL, Project text NOT NULL, FromTo text NOT NULL, Data text NULL)"))
    .then(() => db.queryScript("CREATE TABLE IF NOT EXISTS dbo.Scenes (Id serial primary key, SceneID uuid UNIQUE NOT NULL, Processed integer NOT NULL, ErrorCode text NULL, ErrorDescription text NULL, PutUrl text, GetUrl text, Checksum text NULL, isActive int NOT NULL, DistributorID text NOT NULL, VisitID text NOT NULL, DocumentID text NOT NULL, CustomerID text NOT NULL, EmployeeID text NOT NULL, Custom text NULL, CreateDate timestamp NOT NULL, UpdatedDate timestamp NOT NULL)"))
    .then(() => db.queryScript("CREATE TABLE IF NOT EXISTS dbo.ClientSessions (Id serial primary key, SessionID uuid NOT NULL, isActive integer, DistributorID text NULL, VisitID text NULL, DocumentID text NULL, CustomerID text NULL, EmployeeID text NULL, Custom text NULL, CreateDate timestamp NOT NULL, UpdatedDate timestamp NOT NULL)"))
    //.then(() => db.queryScript("CREATE TABLE IF NOT EXISTS dbo.RecognitionResults (Id serial primary key, DistributorID text UNIQUE NOT NULL, RecognitionStatus text NOT NULL, RecognitionReport text NOT NULL, RecognitionPhoto bytea NOT NULL)"))
    .then(() => db.queryScript("CREATE TABLE IF NOT EXISTS dbo.GenerateErrors (Id serial primary key, DistributorID text NOT NULL, RecognitionType text NOT NULL, ActionType text NOT NULL, ErrorCode text NULL, ErrorDescription text NULL, WSClose text NULL, HTTPStatusCode integer NULL)"))
    //.then(() => db.queryScript("INSERT INTO dbo.RecognitionResults (DistributorID, RecognitionStatus, RecognitionReport, RecognitionPhoto) VALUES ($1, $2, $3, $4)", defaultRecResData))
    .then(() => addLogs({ "project": "internal", "fromto": "server >> server", "data": "Init DB: Successful" }, false))
    .catch(function (err) {
        console.log(err.toString());
        addLogs({ "project": "internal", "fromto": "server >> server", "data": "Init DB: ERROR: " + err.toString() }, false);
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

//recognition  ONLINE
app.ws('/onlinereco', (ws, req) => {
    let sessionId = uuidv4();
    ws.sessionId = sessionId;
    connects.push(ws);

    db.newSession(sessionId)
        .then(() => addLogs({ "project": "online", "fromto": "client >> serv", "data": "newConnection (" + sessionId + ") headers: <br>" + JSON.stringify(req.headers) }))
        .catch(function (err) {
            sendErrorToWsClientOnlineProject(err, 'newConnection', null, null, sessionId);
        });


    ws.on('close', () => {
        connects = connects.filter(conn => { return (conn === ws) ? false : true; });

        db.deleteSession(sessionId)
            .then(() => addLogs({ "project": "online", "fromto": "?", "data": "closeConnection (" + sessionId + ")" }))
            .catch(function (err) {
                sendErrorToWsClientOnlineProject(err, 'closeConnection', null, null, sessionId);
            });
    });

    ws.on('message', message => {
        try {
            let jsonMessage = JSON.parse(message);

            switch (jsonMessage.type) {
                case 'connection':
                    addLogs({ "project": "online", "fromto": "client >> server", "data": JSON.stringify(jsonMessage) })
                        .then(() => db.updateSession(sessionId, jsonMessage))
                        .then(() => db.checkErrorBySessionID('online', 'online_connection (global)', sessionId)
                            .then(function (result) {
                                if (result === undefined) {
                                    db.sceneStatuses(sessionId)
                                        .then((result) => { sendMessageWSClient('online', sessionId, result, false) })
                                        .catch(function (err) { sendErrorToWsClientOnlineProject(err, jsonMessage.type, null, null, sessionId); });
                                } else {
                                    let data = { type: "error", data: { requestType: jsonMessage.type, errorCode: result.errorcode, errorDescription: result.errordescription } };
                                    sendMessageWSClient('online', sessionId, JSON.stringify(data), result.wsclose);
                                }
                            }))
                        .catch(function (err) { console.log(err); sendErrorToWsClientOnlineProject(err, jsonMessage.type, null, null, sessionId); });

                    break;

                case 'scene':
                    addLogs({ "project": "online", "fromto": "client >> server", "data": JSON.stringify(jsonMessage) })
                        .then(() => db.checkErrorBySessionID('online', 'online_scene (global)', sessionId)
                            .then(function (result) {
                                if (result === undefined) {
                                    db.newScene(sessionId, jsonMessage.data.sceneID)
                                        .then(() => db.checkErrorBySessionID('online', 'online_scene (scene)', sessionId)
                                            .then(function (result) {
                                                if (result === undefined) {
                                                    db.sceneStatuses(sessionId)
                                                        .then((result) => { sendMessageWSClient('online', sessionId, result, false) })
                                                        .catch(function (err) { sendErrorToWsClientOnlineProject(err, jsonMessage.type, null, null, sessionId); });
                                                } else {
                                                    db.errorScene(jsonMessage.data.sceneID, result.errorcode, result.errordescription)
                                                        .then(() => db.sceneStatuses(sessionId)
                                                            .then((result) => { sendMessageWSClient('online', sessionId, result, false) }))
                                                        .catch(function (err) { sendErrorToWsClientOnlineProject(err, jsonMessage.type, null, null, sessionId); });
                                                }
                                            }))
                                } else {
                                    let data = { type: "error", data: { requestType: jsonMessage.type, errorCode: result.errorcode, errorDescription: result.errordescription } };
                                    sendMessageWSClient('online', sessionId, JSON.stringify(data), result.wsclose);
                                }
                            }))
                        .catch(function (err) { sendErrorToWsClientOnlineProject(err, jsonMessage.type, null, jsonMessage.data.sceneID, sessionId); });

                    break;

                case 'finish':
                    let scenePath = config.new_scene + jsonMessage.data.sceneID + '.rec';
                    let sceneJsonPath = config.new_scene + jsonMessage.data.sceneID + '.json';

                    addLogs({ "project": "online", "fromto": "client >> server", "data": JSON.stringify(jsonMessage) })
                        .then(() => db.checkErrorBySessionID('online', 'online_finish (global)', sessionId)
                            .then(function (result) {
                                if (result === undefined) {
                                    db.checkErrorBySessionID('online', 'online_finish (before processed 2)', sessionId)
                                        .then(function (result) {
                                            if (result === undefined) {
                                                unzipSceneFile(jsonMessage.data.sceneID, scenePath)
                                                    .then(() => deleteFile(scenePath))
                                                    .then(() => db.finishNewScene(jsonMessage.data.sceneID, jsonMessage.data.checksum))
                                                    .then(() => db.sceneStatuses(sessionId)
                                                        .then((result) => { sendMessageWSClient('online', sessionId, result, false) }))
                                                    .then(() => db.checkErrorBySessionID('online', 'online_finish (before processed 3)', sessionId)
                                                        .then(function (result) {
                                                            if (result === undefined) {
                                                                getSceneFile(jsonMessage.data.sceneID)
                                                                    .then(() => sceneRecognizedUpdateStatus(jsonMessage.data.sceneID))
                                                                    .then(() => deleteFile(sceneJsonPath))
                                                                    .then(() => sleep(8000))
                                                                    .then(() => db.sceneStatuses(sessionId)
                                                                        .then((result) => { sendMessageWSClient('online', sessionId, result, false) }))
                                                                    .catch(function (err) { sendErrorToWsClientOnlineProject(err, jsonMessage.type, null, null, sessionId); });

                                                            } else {
                                                                db.errorScene(jsonMessage.data.sceneID, result.errorcode, result.errordescription)
                                                                    .then(() => sleep(8000))
                                                                    .then(() => db.sceneStatuses(sessionId)
                                                                        .then((result) => { sendMessageWSClient('online', sessionId, result, false) }))
                                                                    .catch(function (err) { sendErrorToWsClientOnlineProject(err, jsonMessage.type, null, null, sessionId); });
                                                            }
                                                        }))

                                            } else {
                                                db.errorScene(jsonMessage.data.sceneID, result.errorcode, result.errordescription)
                                                    .then(() => db.sceneStatuses(sessionId)
                                                        .then((result) => { sendMessageWSClient('online', sessionId, result, false) }))
                                                    .catch(function (err) { sendErrorToWsClientOnlineProject(err, jsonMessage.type, null, null, sessionId); });
                                            }
                                        })

                                } else {
                                    let data = { type: "error", data: { requestType: jsonMessage.type, errorCode: result.errorcode, errorDescription: result.errordescription } };
                                    sendMessageWSClient('online', sessionId, JSON.stringify(data), result.wsclose);
                                }
                            }))
                        .catch(function (err) { sendErrorToWsClientOnlineProject(err, jsonMessage.type, null, jsonMessage.data.sceneID, sessionId); });

                    break;

                case 'status':
                    addLogs({ "project": "online", "fromto": "client >> server", "data": JSON.stringify(jsonMessage) })
                        .then(() => db.checkErrorBySessionID('online', 'online_status', sessionId)
                            .then(function (result) {
                                if (result === undefined) {
                                    db.sceneStatuses(sessionId)
                                        .then((result) => { sendMessageWSClient('online', sessionId, result, false) })
                                        .catch(function (err) { sendErrorToWsClientOnlineProject(err, jsonMessage.type, null, null, sessionId); });
                                } else {
                                    db.errorScene(jsonMessage.data.sceneID, result.errorcode, result.errordescription)
                                        .then(() => db.sceneStatuses(sessionId)
                                            .then((result) => { sendMessageWSClient('online', sessionId, result, false) }))
                                        .catch(function (err) { sendErrorToWsClientOnlineProject(err, jsonMessage.type, null, null, sessionId); });
                                }
                            }))
                        .catch(function (err) { sendErrorToWsClientOnlineProject(err, jsonMessage.type, null, jsonMessage.data.sceneID, sessionId); });
                    break;

                case 'delete':
                    addLogs({ "project": "online", "fromto": "client >> server", "data": JSON.stringify(jsonMessage) })
                        .then(() => db.checkErrorBySessionID('online', 'online_delete', sessionId)
                            .then(function (result) {
                                if (result === undefined) {
                                    db.deleteScene(sessionId, jsonMessage.data.sceneID)
                                        .then(() => db.sceneStatuses(sessionId)
                                            .then((result) => { sendMessageWSClient('online', sessionId, result, false) }))
                                        .catch(function (err) { sendErrorToWsClientOnlineProject(err, jsonMessage.type, null, null, sessionId); });
                                } else {
                                    db.errorScene(jsonMessage.data.sceneID, result.errorcode, result.errordescription)
                                        .then(() => db.sceneStatuses(sessionId)
                                            .then((result) => { sendMessageWSClient('online', sessionId, result, false) }))
                                        .catch(function (err) { sendErrorToWsClientOnlineProject(err, jsonMessage.type, null, null, sessionId); });
                                }
                            }))
                        .catch(function (err) { sendErrorToWsClientOnlineProject(err, jsonMessage.type, null, jsonMessage.data.sceneID, sessionId); });

                    break;
                default:
                    addLogs({ "project": "online", "fromto": "client >> server", "data": "Unknown Message Type: <br>" + JSON.stringify(jsonMessage) })

                    break;
            }
        } catch (err) {
            addLogs({ "project": "online", "fromto": "client >> server", "data": "Error: <br>" + err.toString() })
        }

    });
});

app.put('/onlinereco/scene/:sceneID', (req, res) => {
    let scenePath = config.new_scene + req.params.sceneID + '.rec'
    var writeStream = fs.createWriteStream(scenePath);
    req.pipe(writeStream);

    req.on('end', function () {

        db.getDistrIdBySceneId(req.params.sceneID)
            .then((result) => db.checkErrorByDistributorID('online', 'online_putScene', (typeof result !== 'undefined') ? result.distributorid : '-1')
                .then(function (result) {
                    if (result === undefined) {
                        answer(200, 'ok');
                    } else {
                        answer(result.httpstatuscode, result.errorcode + ' : ' + result.errordescription);
                    }
                }))
            .catch(function (err) {
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
        .then((result) => db.checkErrorByDistributorID('online', 'online_getScene', (typeof result !== 'undefined') ? result.distributorid : '-1')
            .then(function (result) {
                if (result === undefined) {
                    answer(200, null, scenePath);
                } else {
                    answer(result.httpstatuscode, result.errorcode + ' : ' + result.errordescription);
                }
            }))
        .catch(function (err) {
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

function sendErrorToWsClientOnlineProject(err, actionType, errorCode, sceneId = null, sessionId = null) {
    return new Promise((resolve, reject) => {
        let wsType = 'online';
        errorCode = (errorCode !== null) ? errorCode : 'ERROR_INTERNAL_SERVER_ERROR';
        let defaultMessage = '{"type":"error", "data":{"requestType":"' + actionType + '", "errorCode":"' + errorCode + '", "errorDescription":' + JSON.stringify(err.type) + ' : ' + JSON.stringify(err.data) + '}}';

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
                        db.errorScene(sceneId, 'ERROR_INTERNAL_SERVER_ERROR', 'action: delete, err: ' + JSON.stringify(err.data))
                            .then(() => db.sceneStatuses(sessionId)
                                .then(function (result) {
                                    sendMessageWSClient(wsType, sessionId, result, false);
                                    return resolve();
                                }))
                            .catch(function (err) {
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
                        db.errorScene(sceneId, 'ERROR_INTERNAL_SERVER_ERROR', 'action: scene, err: ' + JSON.stringify(err.data))
                            .then(() => db.sceneStatuses(sessionId))
                            .then(function (result) {
                                sendMessageWSClient(wsType, sessionId, result, true);
                                return resolve();
                            })
                            .catch(function (err) {
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
                        db.errorScene(sceneId, 'ERROR_INTERNAL_SERVER_ERROR', 'action: finish, err: ' + JSON.stringify(err.data))
                            .then(() => db.sceneStatuses(sessionId)
                                .then(function (result) {
                                    sendMessageWSClient(wsType, sessionId, result, false);
                                    return resolve();
                                }))
                            .catch(function (err) {
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

function sendMessageWSClient(project, sessionId, message, close) {
    addLogs({ "project": project, "fromto": "server >> client", "data": message })
        .then(() => {
            if (project === 'online') {
                connects.filter(conn => { return (conn.sessionId === sessionId) ? true : false; }).forEach(socket => {
                    socket.send(message);
                    if (close === 'true') socket.close();
                });
            } else if (project === 'site (LogPage)') {
                siteConnects.filter(conn => { return (conn.siteSessionId === sessionId) ? true : false; }).forEach(socket => {
                    socket.send(message);
                    if (close === 'true') socket.close();
                });
            }
        })
        .catch((err) => {
            console.error(err);
        })
};


//recognition  OFFLINE
app.post('/offlinereco', (req, res) => {
    var busboy = new Busboy({ headers: req.headers });
    let data = { answer: [] }
    addLogs({ "project": "offline", "fromto": "client >> server", "data": JSON.stringify(req.headers) })

    busboy.on('field', (fieldname, file, filename, encoding, mimetype) => {
        try {
            data.sceneIdUpload = JSON.parse(file)[0].sceneID;
            data.resulturl = JSON.parse(JSON.stringify(req.headers))['result-url'];
            data.documentRecognitionStatusCode = JSON.parse(file)[0].documentRecognitionStatusCode;
            data.distributorid = JSON.parse(file)[0].distributorID;

            data.filePath_NewScene = config.new_scene + data.sceneIdUpload + '.rec';
            data.filePath_NewSceneJson = config.new_scene + data.sceneIdUpload + '.json';
            data.filePath_Result = config.scene_results + data.sceneIdUpload + '.rec';

            data.answer = JSON.parse(file);
            data.httpstatuscode = 207; //correct request

            data.answer[0].responseStatus = 201;
            delete data.answer[0].fileName;
            delete data.answer[0].fileChecksum;
            delete data.answer[0].documentRecognitionStatusCode;
        } catch {
            data.httpstatuscode = 400; //incorrect request
        }
    });

    busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
        addLogs({ "project": "offline", "fromto": "client >> server", "data": "sceneID: " + fieldname });
        file.pipe(fs.createWriteStream(config.new_scene + fieldname + '.rec'));
    });

    busboy.on('finish', function () {
        if (data.httpstatuscode === 400) {
            answer(data.httpstatuscode, data);
        } else {
            db.checkErrorByDistributorID('offline', 'offline_global', (typeof data.distributorid !== 'undefined') ? data.distributorid : '-1')
                .then((result) => {
                    if (result === undefined) {
                        db.checkErrorByDistributorID('offline', 'offline_scene', (typeof data.distributorid !== 'undefined') ? data.distributorid : '-1')
                            .then((result) => {
                                if (result === undefined) {
                                    if (data.documentRecognitionStatusCode == 'NeedRecognition') {
                                        unzipSceneFile(data.sceneIdUpload, data.filePath_NewScene)
                                            .then(() => deleteFile(data.filePath_NewScene))
                                            .then(() => getSceneFile(data.sceneIdUpload))
                                            .then(() => deleteFile(data.filePath_NewSceneJson))
                                            .then(() => answer(data.httpstatuscode, data.answer))
                                            .then(() => sendPostResult(data.resulturl, data.answer, data.filePath_Result, data.sceneIdUpload))
                                            .catch(function (err) {
                                                data.httpstatuscode = 500;
                                                answer(data.httpstatuscode, err);
                                                addLogs({ "project": "offline", "fromto": "client >> server", "data": "Error: <br>" + err.toString() })
                                                    .catch(function (err) {
                                                        console.log('offlinereco_NeedRecognition: ' + err.toString());
                                                    });
                                            });
                                    } else {
                                        fs.access(data.filePath_Result, fs.constants.F_OK, (err) => { //check result scene file exists
                                            if (err) {
                                                data.answer[0].responseStatus = 404;
                                                answer(data.httpstatuscode, data.answer);
                                            } else {
                                                answer(data.httpstatuscode, data.answer)
                                                .then(() => sendPostResult(data.resulturl, data.answer, data.filePath_Result, data.sceneIdUpload))
                                                .catch(function (err) {
                                                    addLogs({ "project": "offline", "fromto": "client >> server", "data": "Error: <br>" + err.toString() })
                                                        .catch(function (err) {
                                                            console.log('offlinereco_sendPostResult: ' + err.toString());
                                                        });
                                                });
                                            }
                                        })
                                    }
                                } else {
                                    data.answer[0].responseStatus = result.httpstatuscode;
                                    answer(data.httpstatuscode, data.answer);
                                }
                            })
                            .catch(function (err) {
                                answer(500, err.toString());
                            });
                    } else {
                        answer(result.httpstatuscode, { errorCode: result.errorcode, errorDescription: result.errordescription });
                    }
                })
                .catch(function (err) {
                    answer(500, err.toString());
                });
        }

        function answer(httpstatuscode, body) {
            addLogs({ "project": "offline", "fromto": "server >> client", "data": "httpCode: " + httpstatuscode + " body: " + JSON.stringify(body) })
                .catch(function (err) {
                    console.log('offlinereco_answer: ' + err.toString());
                });

            res.setHeader("Content-Type", "application/json");
            res.status(httpstatuscode).json(body);
            res.end();
        };

    });
    return req.pipe(busboy);
});

function sendPostResult(url, scenes, resultFilePath, sceneID) {
    let scenesClone = JSON.parse(JSON.stringify(scenes));
    delete scenesClone[0].responseStatus;
    scenesClone[0].fileName = sceneID + '.rec';

    return new Promise((resolve, reject) => {
        var formData = {
            'scenes': JSON.stringify(scenesClone),
            [sceneID]: fs.createReadStream(resultFilePath)
        };
        var uploadOptions = {
            "url": url,
            "method": "POST",
            "headers": {
                "Token": config.offline_api_token
            },
            "formData": formData
        }
        
        request(uploadOptions, function (err, responce, body) {
            if (err) {
                addLogs({ "project": "offline", "fromto": "server >> client", "data": "sendToApi: ERROR: <br>" + sceneID + ' : ' + JSON.stringify(uploadOptions) + ' : ' + err.toString() });
                return reject('error_sendPostResult'+err.toString());
            } else {
                addLogs({ "project": "offline", "fromto": "server >> client", "data": "sendToApi: <br>" + sceneID + ' : ' + JSON.stringify(uploadOptions) })
                .then (() => addLogs({ "project": "offline", "fromto": "client >> server", "data": "responce_sendToApi: <br>" + sceneID + ' : ' + JSON.stringify(responce) }));
                return resolve('done_sendPostResult');
            }
        });
    });
};


// site INFO PAGE (START)
app.get('/', (req, res) => {
    res.status(200);
    res.sendFile(config.public_path + 'index.html');
});


// site LOG PAGE (START)
app.get('/log', (req, res) => {
    res.status(200);
    res.sendFile(config.public_path + 'log.html');
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

                    db.getAllLogs().then(function (result) {
                        ws.send(JSON.stringify({ type: "allLogs", data: JSON.parse(result) }));
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

function addLogs(log, send = true) {
    return new Promise((resolve, reject) => {
        db.dbAddLog(log)
            .then((result) => {
                if (send) siteConnects.forEach(socket => { socket.send(JSON.stringify({ type: "partialLogs", data: JSON.parse(result) })); });
                return resolve("LOG has been added: " + JSON.stringify(log));
            })
            .catch(function (err) {
                return reject({ type: "addLog", data: err.toString() })
            });
    });
};


// site Recognition Results PAGE (START)
app.get('/recognizedresults', (req, res) => {
    res.status(200);
    res.sendFile(config.public_path + 'recognizedresults.html');
});

app.post('/addRecognitionResults', (req, res) => {
    var busboy = new Busboy({ headers: req.headers });
    let resultSettings = {};
    addLogs({ "project": "site (LogPage)", "fromto": "client >> server", "data": "action: add recognition results" })

    busboy.on('field', (fieldname, file, filename, encoding, mimetype) => {
        resultSettings[fieldname] = (file === '') ? null : file;
    });

    busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
        let name = (fieldname === 'scenejson') ? 'scene.json' : 'scene.jpg';
        file.pipe(fs.createWriteStream(config.new_scene + name));
    });

    busboy.on('finish', function () {
        let report = JSON.parse(fs.readFileSync(config.new_scene + 'scene.json', 'utf8')).report;
        if (report !== 'undefined') {
            let photo = fs.readFileSync(config.new_scene + 'scene.jpg', { encoding: 'hex', flag: 'r' });
            db.setRecognitionResults(resultSettings.distributorId, resultSettings.recognitionStatusCode, JSON.stringify(report), '\\x' + photo)
                .then(function () {
                    fs.unlinkSync(config.new_scene + 'scene.json');
                    fs.unlinkSync(config.new_scene + 'scene.jpg');
                })
                .then(function () { responce({ success: true, distributorId: resultSettings.distributorId }); })
                .catch(function (err) {
                    responce({ success: false, error: err.toString() });
                });
        } else {
            responce({ success: false, error: 'report undefined ' });
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

    busboy.on('finish', function () {
        db.getRecognitionResults()
            .then(function (result) {
                responce(200, result);
            })
            .catch(function (err) {
                responce(500, { success: false, error: err.toString() });
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
        if (Object.keys(field)[0] === 'distributorid') {
            resultSettings.distributorid = field.distributorid
        };
    });

    busboy.on('finish', function () {
        db.getResultRowDetails(resultSettings.distributorid)
            .then(function (result) {
                responce(200, result);
            })
            .catch(function (err) {
                responce(500, { success: false, error: err.toString() });
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
        if (Object.keys(field)[0] === 'distributorid') {
            resultSettings.distributorid = field.distributorid
        };
    });

    busboy.on('finish', function () {
        db.deleteResultRow(resultSettings.distributorid)
            .then(function (result) {
                responce(200, result);
            })
            .catch(function (err) {
                responce(500, { success: false, error: err.toString() });
            });

        function responce(code, answer) {
            res.setHeader("Content-Type", "application/json");
            res.status(code).json(answer);
            res.end();
        }
    });
    return req.pipe(busboy);
});

function getDefaultRecResData() {
    return new Promise((resolve, reject) => {
        try {
            let photo = fs.readFileSync(config.default_scene_result_path + 'scene.jpg', { encoding: 'hex', flag: 'r' });
            let report = fs.readFileSync(config.default_scene_result_path + 'report.json', 'utf8');
            let data = [
                '-1',
                'RecognizedOk',
                report,
                '\\x' + photo
            ]
            return resolve(data);
        } catch (err) {
            return reject({ type: "getDefaultRecData", data: err.toString() });
        }
    });
};


// site Generate Error PAGE (START)
app.get('/generateerrors', (req, res) => {
    res.status(200);
    res.sendFile(config.public_path + 'generateErrors.html');
});

app.post('/getErrors', (req, res) => {
    var busboy = new Busboy({ headers: req.headers });

    busboy.on('finish', function () {
        db.getErrors()
            .then(function (result) {
                responce(200, result);
            })
            .catch(function (err) {
                responce(500, { success: false, error: err.toString() });
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
        errorData[fieldname] = (file === '') ? null : file;
    });

    busboy.on('finish', function () {
        db.setError(errorData.distributorId, errorData.recognitionType, errorData.actionType, errorData.errorCode, errorData.errorDescription, errorData.httpStatusCode, errorData.wsClose)
            .then(function () { responce({ success: true, distributorId: errorData.distributorId }); })
            .catch(function (err) {
                responce({ success: false, error: err.toString() });
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
        if (Object.keys(field)[0] === 'id') {
            data.id = field.id
        };
    });

    busboy.on('finish', function () {
        db.deleteErrorRow(data.id)
            .then(function (result) {
                responce(200, result);
            })
            .catch(function (err) {
                responce(500, { success: false, error: err.toString() });
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
function sleep(timeout) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve('Inside test await');
        }, timeout);
    });
};

function getNowDate() {
    return dateFormat(new Date(), "yyyy-mm-dd HH:MM:ss.l o");
};
