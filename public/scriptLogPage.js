$(document).ready(function () {
    let HOST = location.origin.replace(/^http/, 'ws')
    let socket = new WebSocket(HOST+'/getLogs');
    let allLogs = [];
    let table;

    loadTable();

    socket.onopen = function() {
        document.getElementById("statusConnection").textContent='Status WS connect (Realtime update table): Connection established';
        document.getElementById("statusConnection").classList.add('connectionOn');
        socket.send('{"type":"getAllLogs"}');
    };

    socket.onclose = function(event) {
        document.getElementById("statusConnection").textContent='Status WS connect (Realtime update table): connection closed, code:' + event.code + ' reason:' + event.reason + '. TRY REFRESH PAGE';
        document.getElementById("statusConnection").classList.remove( 'connectionOn' );
        document.getElementById("statusConnection").classList.add( 'connectionOff' );
    };
    
    socket.onmessage = function(event) {
        const jsonMessage = JSON.parse(event.data);
        switch (jsonMessage.type) {
            case 'allLogs':
                allLogs = jsonMessage.data;
                //loadTable();
                $('#example').DataTable().clear().rows.add(allLogs).draw();
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
        document.getElementById("statusConnection").textContent='Status WS connect (Realtime update table): ERROR, reason:' + error.message + '. TRY REFRESH PAGE';
        document.getElementById("statusConnection").classList.remove( 'connectionOn' );
        document.getElementById("statusConnection").classList.add( 'connectionOff' );
    };

    //refresh table Recognition Results on click button Refresh
    $('#tableLogRefresh').on('click', function() {
       console.log('111');
       //table.destroy();
       socket.send('{"type":"getAllLogs"}');
    });

    function loadTable() {
        table = $('#example').DataTable({
        dom: 'Bfrtip',  
        data: allLogs,
        lengthMenu: [ 10, 25, 50, 75, 100 ],
        deferRender: true,
        buttons: [
                    {text: 'Refresh', attr:{ id: 'tableLogRefresh', class: 'btn btn-primary' } },
                    'pageLength'
        ],
        columns: [
            { data: "id", title: "id"},
            { data: "thedate", title: "TheDate"},
            { data: "status", title: "Status"},
            { data: "messagefrom", title: "MessageFrom"},
            { data: "action", title: "Action"},
            { data: "data", title: "Data"}
        ],
        order: [[ 0, "desc" ]]
        });
    };

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

});