let allLogs = [];
let table;

// JSON data from WebSocket
  function addRow(json) {
    let row = json;
    let node = table.row.add(row).draw(false).node();
  
    setTimeout( function () {
        $(node).addClass( 'highlight' );

        setTimeout( function () {
            $(node)
                .addClass( 'noHighlight' )
                .removeClass( 'highlight' );
    
            setTimeout( function () {
                $(node).removeClass( 'noHighlight' );
            }, 550 );
        }, 500 );
    }, 20 );
  };

  function loadTable() {
        table = $('#example').DataTable({
            data: allLogs,
            deferRender: true,
            columns: [
            { data: "thedate", title: "TheDate"},
            { data: "status", title: "Status"},
            { data: "messagefrom", title: "MessageFrom"},
            { data: "action", title: "Action"},
            { data: "data", title: "Data"}
            ],
            order: [[ 0, "desc" ]]
        });
  };
  



  function connectWS() {
        socket = new WebSocket(HOST+'/getLogs');
        table.destroy();
    };

    let HOST = location.origin.replace(/^http/, 'ws')
    let socket = new WebSocket(HOST+'/getLogs');

    socket.onopen = function() {
        document.getElementById("statusConnection").textContent='Статус: Соединение установлено';
        document.getElementById("statusConnection").classList.add('connectionOn');
        socket.send('{"type":"getAllLogs"}');
    };

    loadTable();


    ///delete for reconnect
    /*let HOST = location.origin.replace(/^http/, 'ws')
    let socket = new WebSocket(HOST+'/getLogs');
    
    socket.onopen = function() {
        document.getElementById("statusConnection").textContent='Статус: Соединение установлено';
        document.getElementById("statusConnection").classList.add('connectionOn');
        socket.send('{"type":"getAllLogs"}');
    };*/
    
    ///delete for reconnect

    socket.onclose = function(event) {
        document.getElementById("statusConnection").textContent='Статус: WebSocket соединение закрыто, код:' + event.code + ' причина:' + event.reason;
        document.getElementById("statusConnection").classList.remove( 'connectionOn' );
        document.getElementById("statusConnection").classList.add( 'connectionOff' );
        //connectWS(); reconnect...
        
        //reconnect...
        let message = document.getElementById("statusConnection").textContent;
        let i = 3
        function reconnect() {
            let text = message + '  RECONNECT AFTER  ';
            text = text.substring(0, text.length - 1);
            document.getElementById("statusConnection").textContent=text + i;
            i--;
            if ( (i-3) <= 0 ) {
                console.log('reconnect WS')
                connectWS(); 
            }
        }
        let timerId = setInterval(() => reconnect(), 1000);
        setTimeout(() => { clearInterval(timerId); }, 4000);
        //reconnect...

    };
  
    socket.onmessage = function(event) {
        const jsonMessage = JSON.parse(event.data);
        switch (jsonMessage.type) {
            case 'allLogs':
                allLogs = jsonMessage.data;
                table.destroy();
                loadTable();
            break;
        
            case 'partialLogs':
                data = jsonMessage.data;
                data.forEach(element => {
                    var data = table
                    .rows()
                    .data();
                    addRow(element);
                }); 
            break;
            
            default:
                alert('Неизвестная команда', JSON.stringify(jsonMessage)); 
            break;
        }
    };
  
    socket.onerror = function(error) {
        console.log("Ошибка " + error.message);

        //reconnect...
        let i = 3
        function reconnect() {
            let message = document.getElementById("statusConnection").textContent;
            document.getElementById("statusConnection").textContent=message + '  RECONNECT AFTER ' + i;
            i--;
            if ( (i-3) <= 0 ) {
                console.log('reconnect WS')
                connectWS(); 
            }
        }
        let timerId = setInterval(() => reconnect(), 1000);
        setTimeout(() => { clearInterval(timerId); }, 4000);
        //reconnect...

    };

    $('#tableDestroy').on( 'click', function () {
        table.destroy();
        socket.send('{"type":"getAllLogs"}');
    });



