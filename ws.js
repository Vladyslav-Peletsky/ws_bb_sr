import {WebSocketServer}  from 'ws';
import {newSession, updateSession, deleteSession, newScene, finishNewScene, deleteScene, sceneStatuses} from './database.js';
import { v4 as uuidv4 } from 'uuid';

const PORT = process.env.PORT || 5000
const wsServer = new WebSocketServer({ port: PORT });

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
        //console.log(JSON.parse(message));
            try {
            const jsonMessage = JSON.parse(message);
            switch (jsonMessage.type) {
                case 'connection':
                    updateSession (clientId, jsonMessage);
                    sceneStatuses(clientId).then(function(result) {
                        wsClient.send(result);
                    });
                    console.log('connection');
                    break;
                case 'scene':
                   newScene (clientId, jsonMessage.data.sceneID);
                   sceneStatuses(clientId).then(function(result) {
                        wsClient.send(result);
                    });
                    console.log('newScene');
                    break;
                case 'finish':
                    finishNewScene (clientId, jsonMessage.data.sceneID);
                    sceneStatuses(clientId).then(function(result) {
                        wsClient.send(result);
                    });
                    console.log('finishNewScene');
                    break;
                case 'get':
                    console.log('get');
                    break;
                case 'status':
                    sceneStatuses(clientId);
                    sceneStatuses(clientId).then(function(result) {
                        wsClient.send(result);
                    });
                    console.log('status');
                    break;
                case 'delete':
                    deleteScene (clientId, jsonMessage.data.sceneID);
                    sceneStatuses(clientId).then(function(result) {
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
    });
}

console.log('Сервер запущен на 9000 порту');

export {onConnect};



