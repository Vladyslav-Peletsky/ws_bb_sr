$(document).ready(function () {
    let HOST = location.origin;
    let table;

    loadTable();
    getRecognitionResults();
  
/*-----------------------------------EVENTS START------------------------------------------------------------------------*/

    //form set recognition results
    $('#setRecognitionResults').on('click', function(e) {
        //stop submit the form, we will post it manually.
        event.preventDefault();
        let distributorId = document.getElementById('distributorId').value;
        let recognitionStatusCode = document.getElementById('recognitionStatusCode').value;
        let scenejson = document.getElementById('scenejson').value;
        let scenejpg = document.getElementById('scenejpg').value;
        
        if (distributorId && recognitionStatusCode && scenejson && scenejpg) {
			var data = new FormData($('#recognitionResultsUploadForm')[0]);
            // data.append("CustomField", "This is some extra data, testing");
            $("#setRecognitionResults").prop("disabled", true);
            $.ajax({
                type: "POST",
                enctype: 'multipart/form-data',
                url: HOST+'/addRecognitionResults',
                data: data,
                processData: false,
                contentType: false,
                cache: false,
                timeout: 600000,
                success: function (data) {
                    showSuccessAlert();
                    $("#setRecognitionResults").prop("disabled", false);
                    getRecognitionResults();
                    document.getElementById("recognitionResultsUploadForm").reset();
                    $('#addRecResultsModal').modal('hide'); // calling the bootstrap modal
                },
                error: function (err) {
                    showDangerAlert(err);
                    getRecognitionResults();
                    $("#setRecognitionResults").prop("disabled", false);
                    console.error(err);
                }
            });
        } else {
            alert('You need filled all fields')
        }
    });

    //modal show row details Recognition Results
    $('#example tbody').on('click', '#showRowData', function() {
        var data = table.row($(this).parents('tr')).data(); // getting target row data
        postRequest('getRecognitionResultsRowDetails', '/getRecognitionResultsRowDetails', JSON.stringify({ "distributorid": data.distributorid}) )
        .then(function(result) {
            $('.rowInfo').html('<table class="table dtr-details" width="100%"><tbody><tr><td>DistributorID<td><td>' + data.distributorid + '</td></tr><tr><td>Recognition Status Code<td><td>' + data.recognitionstatus + '</td></tr></tbody></table>');
            $('#rowDetailRecognitionPhoto').html('<img data-src="holder.js/100px250" class="img-fluid float-left" style="max-height: 500px;" src="data:image/png;base64,'+result.recognitionphoto+'" data-holder-rendered="true">');
            $('#rowDetailRecognitionResult').html(result.recognitionreport);
            $('#showRowDetails').modal('show'); // calling the bootstrap modal
        } )
        .catch(function(err) { console.error(err); })
    });

    //delete row Recognition Results
    $('#example tbody').on('click', '#deleteRowData', function() {
        var data = table.row($(this).parents('tr')).data(); // getting target row data
        if (data.distributorid !== '-1')
            {
                if (confirm("Are you sure you want to delete the results for the distributor: "+data.distributorid+" ?") == true) {
                    postRequest('deleteRowData', '/deleteRecognitionResultsRow', JSON.stringify({ "distributorid": data.distributorid}) )
                    .then(function() {
                        getRecognitionResults();
                    })
                    .catch(function(err) { 
                        getRecognitionResults();
                        console.error(err);
                    })
                  } 
            } else {
                alert('Recognition result for DistributorID: -1 is not available for deletion')
            }
      });
    
    //delete row Recognition Results
    $('#example tbody').on('click', '#editRowData', function() {
        var data = table.row($(this).parents('tr')).data(); // getting target row data
        $('#distributorId').val(data.distributorid);
        $('#distributorId').attr("readonly", "readonly");
        $('#recognitionStatusCode').val(data.recognitionstatus);

        $('#addRecResultsModal').modal('show'); // calling the bootstrap modal
    });

    //show Add Recognition Results modal on click button Add
    $('#addRecResultsBut').on('click', function () {
        $('#addRecResultsModal').modal('show'); // calling the bootstrap modal
    });

    //refresh table Recognition Results on click button Refresh
    $('#refreshRecResultsTableBut').on('click', function () {
        getRecognitionResults();
    });

    //reset form Add Recognition Results on hide modal
    $("#addRecResultsModal").on('hide.bs.modal', function(){
        $("#distributorId").removeAttr("readonly");
        document.getElementById("recognitionResultsUploadForm").reset();
        
    });

/*-----------------------------------EVENTS END------------------------------------------------------------------------*/

/*-----------------------------------FUNCTIONS START------------------------------------------------------------------------*/

    //initialization Recognition Results table
    function loadTable() {
        let allLogs = [];
        table = $('#example').DataTable({
            dom: 'Bfrtip',
            data: allLogs,
            deferRender: true,
            lengthMenu: [ 10, 25, 50, 75, 100 ],
            buttons: [
                {text: 'Add', attr:{ id: 'addRecResultsBut', class: 'btn btn-primary' } },
                {text: 'Refresh', attr:{ id: 'refreshRecResultsTableBut', class: 'btn btn-primary' } },
                'pageLength'
            ],
            columns: [
                { data: "distributorid", title: "DistributorID"},
                { data: "recognitionstatus", title: "Recognition Status Code"},
                { data: null, title: "Show", defaultContent: "<button class='btn btn-primary px-2 py-0' id='showRowData'>Show</button>"},
                { data: null, title: "Edit", defaultContent: "<button class='btn btn-warning px-2 py-0' id='editRowData'>Edit</button>"},
                { data: null, title: "Delete", defaultContent: "<button class='btn btn-danger px-2 py-0' id='deleteRowData'>Delete</button>"}
            ],
            order: [[ 0, "ASC" ]]
        });
    };

    //get data Recognition Results and update table
    function getRecognitionResults() {
        postRequest('getRecognitionResults', '/getRecognitionResults', JSON.stringify({getData: true}) )
        .then(function(result) {
            $('#example').DataTable().clear().rows.add(result).draw();
        })
        .catch(function(err) { console.error(err); })
    };

    //post request
    function postRequest(actionType, api, dataToSend) {
        return	new Promise((resolve, reject) => {  
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
                    return reject( {type:actionType, data:err.toString()} );
                }
            });
        });
    };

    //show success alert
    function showSuccessAlert() {
    $("#success-alert").fadeTo(2000, 500).slideUp(500, function() {
        $("#success-alert").slideUp(500);
      });
    };

    //show danger alert
    function showDangerAlert() {
    $("#success-danger").fadeTo(2000, 500).slideUp(500, function() {
        $("#success-danger").slideUp(500);
      });
    };
/*-----------------------------------FUNCTIONS END------------------------------------------------------------------------*/

});