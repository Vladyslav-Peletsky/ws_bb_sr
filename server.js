const WebSocket = require('ws');
const PORT = process.env.PORT || 5000
const wsServer = new WebSocket.Server({ port: PORT });

wsServer.on('connection', onConnect);

function onConnect(wsClient) {
    console.log('Новый пользователь');
    wsClient.send('Привет');

    wsClient.on('close', function() {
        console.log('Пользователь отключился');
    });

    wsClient.on('message', function(message) {
        console.log(JSON.parse(message));
        var now = new Date();    
        const logTextToFile = now + ' : '+ JSON.stringify(JSON.parse(message));
            
        /*log*/
            const fs = require('fs');
            const path = 'logs/logs.txt';

            if (!fs.existsSync(path)) {
                fs.writeFileSync(path, 'StartLog', 'utf8');
              } else {
                    fs.appendFileSync(path, `\n${logTextToFile}`);
                    }
        /*log*/

            try {
            const jsonMessage = JSON.parse(message);
            switch (jsonMessage.action) {
                case 'ECHO':
                    wsClient.send(jsonMessage.data);
                    break;
                case 'PING':
                    setTimeout(function() {
                        wsClient.send('PONG');
                    }, 2000);
                    break;
                default:
                const errorComand = JSON.stringify({
                                        "type":"error",
                                        "data":{
                                        "requestType":"connection",
                                        "errorCode":"ERROR_INTERNAL_SERVER_ERROR",
                                        "errorDescription":"Неизвестная команда"
                                        }
                                    });
                wsClient.send(errorComand);    
                    console.log('Неизвестная команда');
                    break;
            }
        } catch (error) {
            console.log('Ошибка', error);
        }
    });
}

console.log('Сервер запущен на 9000 порту');


