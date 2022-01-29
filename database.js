let connString = process.env.DATABASE_URL || 'postgres://txstbteobiwucu:4f3b9f560b347b9a39b035edace61fddeb5d8f93d6635779f69b215d746e43b9@ec2-54-247-137-184.eu-west-1.compute.amazonaws.com:5432/d6sct12bbs92ns';
import PG from 'pg';
const Pool = PG.Pool;

const pool = new Pool({
  connectionString : connString,
  ssl: {
    rejectUnauthorized: false
  }
});


function newSession(uuid) {
  return	new Promise((resolve, reject) => {
    pool.query('INSERT INTO dbo.ClientSessions (Session, isActive, CreateDate, UpdatedDate) VALUES ($1,1,to_timestamp($2 / 1000.0),to_timestamp($2 / 1000.0));',[uuid,Date.now()], (err, res) => {
        if (err) throw err;
        resolve(JSON.stringify(res.rows));
      });
    });
}

function updateSession(uuid, jsonMessage) {
  return	new Promise((resolve, reject) => {
     pool.query('UPDATE dbo.ClientSessions SET DistributorID =$3,  VisitID = $4, DocumentID = $5, CustomerID =$6, EmployeeID =$7, Custom =$8, UpdatedDate = to_timestamp($2 / 1000.0) WHERE Session = $1;',[uuid, Date.now(), jsonMessage.data.distributorID, jsonMessage.data.visitID, jsonMessage.data.documentID, jsonMessage.data.customerID, jsonMessage.data.employeeID, jsonMessage.data.custom], (err, res) => {
        if (err) throw err;
        console.log(res.rows);
        resolve(JSON.stringify(res.rows));
    });
  });
}

function deleteSession(uuid) {
  return	new Promise((resolve, reject) => {
    pool.query('UPDATE dbo.ClientSessions SET isActive = 0, UpdatedDate = to_timestamp($2 / 1000.0) WHERE Session = $1;',[uuid,Date.now()], (err, res) => {
        if (err) throw err;
        resolve(JSON.stringify(res.rows));
      });
    });
}

function newScene(uuid, sceneID, length) {
  return	new Promise((resolve, reject) => {
      pool.query('INSERT INTO dbo.Scenes (SceneID, Processed, Length, isActive, DistributorID, VisitID, DocumentID, CustomerID, EmployeeID, Custom) SELECT $2, 1, $3,  1, DistributorID, VisitID, DocumentID, CustomerID, EmployeeID, Custom FROM dbo.ClientSessions WHERE Session = $1;',[uuid,sceneID,length], (err, res) => {
          if (err) throw err;
          console.log('newScene:' + sceneID);
          console.log(res.rows);
          resolve(JSON.stringify(res.rows));
      });
    });
}

function finishNewScene(uuid, sceneID, checksum) {
  return	new Promise((resolve, reject) => {  
      pool.query('UPDATE dbo.Scenes SET Processed = 2, Checksum = $2 WHERE SceneID = $1;',[sceneID,checksum], (err, res) => {
          if (err) throw err;
          console.log('finishNewScene:' + sceneID);
          console.log(res.rows);
          resolve(JSON.stringify(res.rows));
      });
    });
}

function sceneRecognized(sceneID, length, checksum) {
  return	new Promise((resolve, reject) => {  
      pool.query('UPDATE dbo.Scenes SET Processed = 3, Length = $2, Checksum = $3 WHERE SceneID = $1;',[sceneID, length, checksum], (err, res) => {
          if (err) throw err;
          console.log('sceneRecognized:' + sceneID);
          console.log(res.rows);
          resolve(JSON.stringify(res.rows));
      });
    });
}

function finishSendScene(sceneID) {
  return	new Promise((resolve, reject) => {  
      pool.query('SELECT sceneid, checksum FROM dbo.scenes WHERE sceneid = $1',[sceneID], (err, res) => {
          if (err) throw err;
          console.log('finishSendScene _ uuid :' + sceneID);
          let finish = {"type":"finish", "data":{} };
          console.log(res.rows[0].sceneid);
          finish.data.sceneid = res.rows[0].sceneid;
          finish.data.checksum = res.rows[0].checksum;
          console.log('finish - ' + JSON.stringify(finish).replace(/sceneid/g, 'sceneID'));
          resolve(JSON.stringify(finish).replace(/sceneid/g, 'sceneID'));
      });
    });
}

function deleteScene(uuid, sceneID) {
  return	new Promise((resolve, reject) => {  
      pool.query('UPDATE dbo.Scenes SET isActive = 0 WHERE SceneID = $1;',[sceneID], (err, res) => {
          if (err) throw err;
          console.log('deleteScene:' + sceneID);
          console.log(res.rows);
          resolve(JSON.stringify(res.rows));
      });
    });
}

function sceneStatuses(uuid) {
  return new Promise(resolve => {
    pool.query("SELECT s.SceneID, s.Processed, Length, Checksum FROM dbo.Scenes s INNER JOIN dbo.ClientSessions cs ON cs.VisitID=s.VisitID AND cs.DocumentID=s.DocumentID WHERE cs.Session = $1 AND isActive =1;",[uuid], (err, res) => {
        if (err) throw err;
        console.log('sceneStatuses _ uuid :' + uuid);
        let sceneStatuses = {"type":"sceneStatuses"};
        sceneStatuses.data = res.rows;
        console.log('sceneStatuses - ' + JSON.stringify(sceneStatuses).replace(/sceneid/g, 'sceneID'));
        resolve(JSON.stringify(sceneStatuses).replace(/sceneid/g, 'sceneID'));
    });
    
  });
}

export {newSession, updateSession, deleteSession, newScene, finishNewScene, sceneRecognized, finishSendScene, deleteScene, sceneStatuses};