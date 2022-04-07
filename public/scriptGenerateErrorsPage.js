$(document).ready(function () {
    let HOST = location.origin;
    let table;

    loadTable();
    getErrorsData();

    /*-----------------------------------EVENTS START------------------------------------------------------------------------*/

    //form set error
    $('#setError').on('click', function (e) {
        //stop submit the form, we will post it manually.
        event.preventDefault();
        let distributorId = document.getElementById('distributorId').value;
        let recognitionType = document.getElementById('recognitionType').value;
        let actionType = document.getElementById('actionType').value;
        let httpStatusCodeShowField = false; 
        if ($('#recognitionType').val() === 'offline' || ($('#actionType').val() === 'putScene' || $('#actionType').val() === 'getScene')) {
            httpStatusCodeShowField = true;
        }
        console.log(httpStatusCodeShowField, $('#httpStatusCode').val());

        if (distributorId && recognitionType && actionType && ((httpStatusCodeShowField === false) || ( httpStatusCodeShowField === true && $('#httpStatusCode').val() !=='' )) ) {
            var data = new FormData($('#errorForm')[0]);
            // data.append("CustomField", "This is some extra data, testing");
            $("#setError").prop("disabled", true);
            $.ajax({
                type: "POST",
                enctype: 'multipart/form-data',
                url: HOST + '/setError',
                data: data,
                processData: false,
                contentType: false,
                cache: false,
                timeout: 600000,
                success: function (data) {
                    showSuccessAlert();
                    $("#setError").prop("disabled", false);
                    getErrorsData();
                    document.getElementById("errorForm").reset();
                    $('#addErrorModal').modal('hide'); // calling the bootstrap modal
                },
                error: function (err) {
                    showDangerAlert(err);
                    getErrorsData();
                    $("#setError").prop("disabled", false);
                    console.error(err);
                }
            });
        } else {
            alert('You need filled all required fields')
        }
    });

    //delete row Error
    $('#example tbody').on('click', '#deleteRowData', function () {
        var data = table.row($(this).parents('tr')).data(); // getting target row data
        if (confirm("Are you sure you want to delete ?") == true) {
            postRequest('deleteErrorRow', '/deleteErrorRow', JSON.stringify({ "id": data.id }))
                .then(function () {
                    getErrorsData();
                })
                .catch(function (err) {
                    getErrorsData();
                    console.error(err);
                })
        }
    });

    //show Add Error modal on click button Add
    $('#addError').on('click', function () {
        $('#addErrorModal').modal('show'); // calling the bootstrap modal
    });

    //refresh table Error on click button Refresh
    $('#refreshDataTable').on('click', function () {
        getErrorsData();
    });

    //reset form Add Error on hide modal
    $("#addErrorModal").on('hide.bs.modal', function () {
        document.getElementById("errorForm").reset();
        selectActionTypes();
        showHideFileds();
    });

    //show Add Error modal on click button Add
    $('#recognitionType').on('change', function () {
        showHideFileds();
    });

    $('#actionType').on('change', function () {
        showHideFileds();
    });

    function showHideFileds(){
        if ( $('#recognitionType').val() === 'offline' || ($('#actionType').val() === 'putScene' || $('#actionType').val() === 'getScene') ) {
            $('#httpStatusCode').prop("disabled", false);
            $('#httpStatusCodeField').show();
            $('#wsClose').prop("disabled", true);
            $('#wsCloseField').hide();
        } else {
            $('#httpStatusCode').val('');
            $('#httpStatusCode').prop("disabled", true);
            $('#httpStatusCodeField').hide();
            $('#wsClose').prop("disabled", false);
            $('#wsCloseField').show();
        }
    };

    var actionTypes = {
        online:["online_connection (global)","online_scene (global)","online_scene (scene)","online_finish (global)","online_finish (before processed 2)","online_finish (before processed 3)","online_status","online_delete","online_putScene","online_getScene"],
        offline:["offline_global","offline_scene"]
      };
      var recognitionType = document.getElementById("recognitionType");
      var recognitionType = document.querySelector("#recognitionType");
      window.onload = selectActionTypes;
      recognitionType.onchange = selectActionTypes;
      
      function selectActionTypes(ev){
        actionType.innerHTML = "";
        var c = this.value || "online", o;
        for(let i = 0; i < actionTypes[c].length; i++){
          o = new Option(actionTypes[c][i],actionTypes[c][i],false,false);
          actionType.add(o);
        };
      }

    /*-----------------------------------EVENTS END------------------------------------------------------------------------*/

    /*-----------------------------------FUNCTIONS START------------------------------------------------------------------------*/

    //initialization Errors table
    function loadTable() {
        let allErrors = [];
        table = $('#example').DataTable({
            dom: 'Bfrtip',
            data: allErrors,
            deferRender: true,
            lengthMenu: [10, 25, 50, 75, 100],
            buttons: [
                { text: 'Add', attr: { id: 'addError', class: 'btn btn-primary' } },
                { text: 'Refresh', attr: { id: 'refreshDataTable', class: 'btn btn-primary' } },
                'pageLength'
            ],
            columns: [
                { data: "id", title: "ID" },
                { data: "distributorid", title: "DistributorID" },
                { data: "recognitiontype", title: "Recognition Type" },
                { data: "actiontype", title: "Action Type" },
                { data: "errorcode", title: "Error Code" },
                { data: "errordescription", title: "Error Description" },
                { data: "wsclose", title: "WS CLOSE Connection" },
                { data: "httpstatuscode", title: "HTTP Status Code" },
                //{ data: null, title: "Edit", defaultContent: "<button class='btn btn-warning px-2 py-0' id='editRowData'>Edit</button>"},
                { data: null, title: "Delete", defaultContent: "<button class='btn btn-danger px-2 py-0' id='deleteRowData'>Delete</button>" }
            ],
            order: [[0, "ASC"]]
        });
    };

    //get Errors data and update table
    function getErrorsData() {
        postRequest('getErrors', '/getErrors', JSON.stringify({ getData: true }))
            .then(function (result) {
                $('#example').DataTable().clear().rows.add(result).draw();
            })
            .catch(function (err) { console.error(err); })
    };

    //post request
    function postRequest(actionType, api, dataToSend) {
        return new Promise((resolve, reject) => {
            $.ajax({
                type: "POST",
                enctype: 'multipart/form-data',
                dataType: "json",
                url: HOST + api,
                data: dataToSend,
                processData: false,
                cache: false,
                timeout: 600000,
                success: function (data) {
                    return resolve(data)
                },
                error: function (err) {
                    return reject({ type: actionType, data: err.toString() });
                }
            });
        });
    };

    //show success alert
    function showSuccessAlert() {
        $("#success-alert").fadeTo(2000, 500).slideUp(500, function () {
            $("#success-alert").slideUp(500);
        });
    };

    //show danger alert
    function showDangerAlert() {
        $("#success-danger").fadeTo(2000, 500).slideUp(500, function () {
            $("#success-danger").slideUp(500);
        });
    };
    /*-----------------------------------FUNCTIONS END------------------------------------------------------------------------*/

});