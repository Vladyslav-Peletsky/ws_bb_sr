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

function newScene(uuid, sceneID) {
  return	new Promise((resolve, reject) => {
      pool.query('INSERT INTO dbo.Scenes (SceneID, Processed, isActive, DistributorID, VisitID, DocumentID, CustomerID, EmployeeID, Custom) SELECT $2, 1, 1, DistributorID, VisitID, DocumentID, CustomerID, EmployeeID, Custom FROM dbo.ClientSessions WHERE Session = $1;',[uuid,sceneID], (err, res) => {
          if (err) throw err;
          console.log('newScene:' + sceneID);
          console.log(res.rows);
          resolve(JSON.stringify(res.rows));
      });
    });
}

function finishNewScene(uuid, sceneID) {
  return	new Promise((resolve, reject) => {  
      pool.query('UPDATE dbo.Scenes SET Processed = 2 WHERE SceneID = $1;',[sceneID], (err, res) => {
          if (err) throw err;
          console.log('finishNewScene:' + sceneID);
          console.log(res.rows);
          resolve(JSON.stringify(res.rows));
      });
    });
}

function sceneRecognized(uuid, sceneID) {
  return	new Promise((resolve, reject) => {  
      pool.query('UPDATE dbo.Scenes SET Processed = 3 WHERE SceneID = $1;',[sceneID], (err, res) => {
          if (err) throw err;
          console.log('sceneRecognized:' + sceneID);
          console.log(res.rows);
          resolve(JSON.stringify(res.rows));
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
    pool.query("SELECT s.SceneID as sceneID, s.Processed as processed, 1607048 as length, 'DF6F67D2CB0C9CDAD337A03D79536988' as checksum FROM dbo.Scenes s INNER JOIN dbo.ClientSessions cs ON cs.VisitID=s.VisitID AND cs.DocumentID=s.DocumentID WHERE cs.Session = $1;",[uuid], (err, res) => {
        if (err) throw err;
        console.log('sceneStatuses _ uuid :' + uuid);
        let sceneStatuses = {"type":"sceneStatuses"};
        sceneStatuses.data = res.rows;
        console.log('sceneStatuses - ' + JSON.stringify(sceneStatuses).replace('sceneid', 'sceneID'));
        resolve(JSON.stringify(sceneStatuses).replace('sceneid', 'sceneID'));
    });
    
  });
}

export {newSession, updateSession, deleteSession, newScene, finishNewScene, sceneRecognized, deleteScene, sceneStatuses};