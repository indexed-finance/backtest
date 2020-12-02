import fs from 'fs';
import path from 'path';

const toHTML = (jsonData) => `
<html>
  <head>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@2.8.0"></script>
  </head>
  <body>
    <div stlye="width: 500px; height: 500px;">
      <canvas id="myChart"></canvas>
    </div>

    <script type="text/javascript">
      var ctx = document.getElementById('myChart').getContext('2d');
      var data = ${jsonData};

      async function writeChart() {
        const options = {
          scales: {
            xAxes: [{ display: true,/*  drawTicks: true */ }],
            yAxes: [{ fill: false }]
          }
        };
        const { datasets, labels } = data;
        const chart = new Chart(ctx, {
            type: 'line',
            options,
            data: {
              labels,
              datasets,
            }
        });
      }
      writeChart()
    </script>
  </body>  
</html>
`;

export function writeHTML(name: string, jsonData: string) {
  const outPath = path.join(__dirname, name+'.html');
  const htmlFile = toHTML(jsonData);
  fs.writeFileSync(outPath, htmlFile);
}