import * as http from 'http';
import * as fs from 'fs';

const PORT=process.env.PORT || 8080; 
console.log('site must on port: '+PORT)

    fs.readFile('./www/index.html', function (err, html) {

        if (err) throw err;    

        http.createServer(function(request, response) {  
            response.writeHeader(200, {"Content-Type": "text/html"});  
            response.write(html);  
            response.end();  
            console.log('start site: '+ PORT);
        }).listen(PORT);
    });
