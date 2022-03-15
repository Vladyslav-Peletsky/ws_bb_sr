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
  


  /* reconnect...
  function connectWS() {
        let HOST = location.origin.replace(/^http/, 'ws')
        let socket = new WebSocket(HOST+'/getLogs');
        
        table.destroy();
        
        socket.onopen = function() {
            document.getElementById("statusConnection").textContent='Статус: Соединение установлено';
            document.getElementById("statusConnection").classList.add('connectionOn');
            socket.send('{"type":"getAllLogs"}');
        };
    };

    connectWS(); */


    ///delete for reconnect
    let HOST = location.origin.replace(/^http/, 'ws')
    let socket = new WebSocket(HOST+'/getLogs');
    
    socket.onopen = function() {
        document.getElementById("statusConnection").textContent='Статус: Соединение установлено';
        document.getElementById("statusConnection").classList.add('connectionOn');
        socket.send('{"type":"getAllLogs"}');
    };
    
    ///delete for reconnect

    socket.onclose = function(event) {
        document.getElementById("statusConnection").textContent='Статус: WebSocket соединение закрыто, код:' + event.code + ' причина:' + event.reason;
        document.getElementById("statusConnection").classList.remove( 'connectionOn' );
        document.getElementById("statusConnection").classList.add( 'connectionOff' );
        сonsole.log(event);
        //connectWS(); reconnect...
    };
  
    socket.onmessage = function(event) {
        const jsonMessage = JSON.parse(event.data);
        switch (jsonMessage.type) {
            case 'allLogs':
                allLogs = jsonMessage.data;
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
    };

    $('#tableDestroy').on( 'click', function () {
        table.destroy();
        socket.send('{"type":"getAllLogs"}');
    });



