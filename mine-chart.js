(function(){
	'use strict';

	function duration(hour){
		return new Date(hour * 60 * 60 * 1000);
	}

	function MineChart(base){
		var that = this;

		that.margin = {top: 10, right: 30, bottom: 20, left: 10};
		that.xScale = d3.scaleTime()
			.domain([new Date() - duration(24), new Date()]); // duration: 24 hours
		that.yScale = d3.scaleLinear();
		that.line = d3.line()
			.defined(function(d){ return d.numplayers !== null; })
			.x(function(d){ return that.xScale(that.x(d)); })
			.y(function(d){ return that.yScale(that.y(d)); });

		that.data = {};
		that.colors = ["#3366cc", "#dc3912", "#ff9900", "#109618", "#990099", "#0099c6", "#dd4477", "#66aa00", "#b82e2e", "#316395", "#994499", "#22aa99", "#aaaa11", "#6633cc", "#e67300", "#8b0707", "#651067", "#329262", "#5574a6", "#3b3eac"];

		that.transitionOnce = false;

		// bind after initialize
		that.bind(base);
		that.onBind();
	}

	MineChart.prototype = new ResponsiveSVG(960, 320, 240);

	MineChart.prototype.x = function(d){
		return +d.time * 60 * 1000;
	}

	MineChart.prototype.y = function(d){
		return +d.numplayers;
	}

	MineChart.prototype.load = function(name){
		return d3.csv("data/statistics/" + name + ".csv");
	}

	MineChart.prototype.nextColor = function(){
		var color = this.colors.shift();
		this.colors.push(color);
		return color;
	}

	MineChart.prototype.preprocessData = function(raw){
		var that = this;
		var datum = [];
		var domain = that.xScale.domain();
		var spans = d3.range(domain[0], domain[1],
			Math.max(60 * 1000, d3.tickStep(domain[0], domain[1], 200))
		);

		var i = raw.length - 1;

		// adjust range
		while(i >= 0 && domain[1] < that.x(raw[i])) i--;

		var span;
		while(span = spans.pop()){
			var elements = [];
			while(i >= 0 && that.x(raw[i]) >= span){
				// out of range?
				if(that.x(raw[i]) < domain[0]){
					spans = []; // no more loop
					break;
				}

				elements.push(raw[i]);

				i--;
			}
			// if y not exists, push null (missing data)
			if(elements.length == 0){
				datum.push({time: null, numplayers: null});
			}else{
				// pick maximum value
				datum.push({time: elements[0].time, numplayers: d3.max(elements, that.y)});
			}
		}
		return datum;
	}

	MineChart.prototype.transition = function(){
		this.transitionOnce = true;
		return this;
	}

	MineChart.prototype.add = function(name){
		var that = this;

		var color = that.nextColor();
		that.data[name] = {
			raw: [],
			datum: [],
			color: color
		};
		var transition = that.transitionOnce;
		that.transitionOnce = false;

		return that.load(name).then(function(raw){
			// may removed while loading
			if(!(name in that.data)) return;
			var data = that.data[name];

			// set datum
			data.raw = raw;
			data.datum = that.preprocessData(raw);

			// draw line
			data.dom = that.g.chart.append("path")
				.attr("stroke", color)
				.attr("stroke-width", 2)
				.attr("fill", "none")
				.datum(data.datum)
				.attr("d", that.line);

			// calculate data min, max
			data.min = d3.min(data.datum, that.y);
			data.max = d3.max(data.datum, that.y);

			// update global min, max
			that.min = Number.isInteger(that.min) ? Math.min(that.min, data.min) : data.min;
			that.max = Number.isInteger(that.max) ? Math.max(that.max, data.max) : data.max;

			// update yScale, yAxis
			that.updateYAxis(transition);
			that.updateLines(transition);
			that.updateLegend(transition);
		});
	}

	MineChart.prototype.timeInterval = function(interval){
		var that = this;
		var previous = that.xScale.domain();
		that.xScale.domain(interval);

		Object.values(that.data).forEach(function(data){
			data.datum = that.preprocessData(data.raw);
			data.dom.datum(data.datum); // apply data
			data.min = d3.min(data.datum, that.y);
			data.max = d3.max(data.datum, that.y);
		});

		// update global min, max
		that.min = d3.min(Object.values(that.data), function(data){ return data.min; });
		that.max = d3.max(Object.values(that.data), function(data){ return data.max; });

		// pre-ready long lines for smooth transition
		that.xScale.domain(previous);
		if(that.transitionOnce) that.updateLines(false);
		that.xScale.domain(interval);

		that.updateXAxis(that.transitionOnce);
		that.updateYAxis(that.transitionOnce);
		that.updateLines(that.transitionOnce);
		that.transitionOnce = false;
	}

	MineChart.prototype.remove = function(name){
		var that = this;

		// delete DOM element and data
		if(that.data[name].dom){
			that.data[name].dom.remove();
		}
		delete that.data[name];

		// update min, max
		that.min = d3.min(Object.values(that.data), function(data){ return data.min; });
		that.max = d3.max(Object.values(that.data), function(data){ return data.max; });

		that.updateYAxis(that.transitionOnce);
		that.updateLines(that.transitionOnce);
		that.updateLegend();
		that.transitionOnce = false;
	}

	MineChart.prototype.toggle = function(name){
		var that = this;
		if(name in that.data) that.remove(name);
		else that.add(name);
	}

	MineChart.prototype.updateXAxis = function(transition = false){
		if(transition) this.g.xAxis.transition().call(this.xAxis);
		else this.g.xAxis.call(this.xAxis);
	}

	MineChart.prototype.updateYAxis = function(transition = false){
		// if min/max is not defined, use default
		var min = this.min || 0; 
		var max = this.max || 100;

		var interval = max - min;
		var step = interval <= 20 ? 1 : interval <= 40 ? 2 : interval <= 80 ? 5 : interval <= 200 ? 10 : interval <= 400 ? 20 : 40;

		var min = Math.max(0, Math.floor((min - 1) / step) * step);
		var max = Math.ceil((max + 1) / step) * step;
		this.yScale.domain([min, max]);
		this.yAxis.tickValues(d3.range(min, max, step));

		if(transition) this.g.yAxis.transition().call(this.yAxis);
		else this.g.yAxis.call(this.yAxis);
	}

	MineChart.prototype.updateLines = function(transition = false){
		var that = this;
		Object.values(that.data).forEach(function(d){
			if(d.dom){
				if(transition) d.dom.transition().attr("d", that.line);
				else d.dom.attr("d", that.line);
			}
		});
	}

	MineChart.prototype.updateLegend = function(){
		var that = this;
		if(that.g){
			var legend = that.g.legend.selectAll("g")
				.data(Object.keys(that.data));

			legend.exit().remove();

			var legendGroup = legend.enter().append("g")
				.attr("transform", function(d, i){ return "translate(0," + i * 20 + ")" });
			legendGroup.append("rect");
			legendGroup.append("text");

			that.g.legend.selectAll("g").select("rect")
				.attr("width", 14)
				.attr("height", 14)
				.attr("fill", function(d){ return that.data[d].color });
			that.g.legend.selectAll("g").select("text")
				.text(function(d){ return d })
				.attr("font-size", "0.8em")
				.attr("transform", "translate(18,10)");

			that.g.legend.select("rect")
				.attr("transform", "translate(-10,-10)")
				.attr("width", 160)
				.attr("height", Object.keys(that.data).length * 20 + 15)
		}
	}

	MineChart.prototype.onBind = function(){
		var that = this;

		that.g = {
			chart: that.base.append("g"),
			xAxis: that.base.append("g"),
			yAxis: that.base.append("g"),
			legend: that.base.append("g"),
			tooltip: d3.select(that.base.node().parentNode).append("div"),
			timeScales: d3.select(that.base.node().parentNode).append("div")
		};

		// initialize g.timeScales
		that.g.timeScales
			.attr("class", "text-center")
			.selectAll("button")
			.data([
				{ span: duration(1), text: "1시간" },
				{ span: duration(3), text: "3시간" },
				{ span: duration(6), text: "6시간" },
				{ span: duration(12), text: "12시간" },
				{ span: duration(24), text: "1일" },
				{ span: duration(24 * 3), text: "3일" }
			])
		.enter().append("span")
			.attr("class", "badge badge-secondary m-1")
			.text(function(d){ return d.text; })
			.on("click", function(d){
				that.transition().timeInterval([that.xScale.domain()[1] - d.span, that.xScale.domain()[1]]);
			});

		// initialize axis
		var locale = d3.timeFormatLocale({
			"periods": ["오전", "오후"],
			"days": ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"],
			"shortDays": ["일", "월", "화", "수", "목", "금", "토"],
			"months": ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"],
			"shortMonths": ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"]
		});
		that.xAxis = d3.axisBottom(that.xScale)
			.tickSize(5)
			.tickFormat(function(d){
				if(d.getMinutes()) return locale.format('%p %I시 %M분')(d);
				if(d.getHours()) return locale.format('%p %I시')(d);
				if(d.getDate() != 1) return locale.format('%e일 %a')(d);
				if(d.getMonth()) return locale.format('%B %e일')(d);
				return locale.format('%Y년')(d);
			});
			//.tickFormat(function(t){ return d3.timeFormat("%p %I시 %M분")(t * 60 * 1000) });
		that.yAxis = d3.axisRight(that.yScale)
			.tickSize(5)
			.tickFormat(d3.format("d"));
		that.updateYAxis();

		// initialize g.axis
		that.g.xAxis.attr("class", "axis axis--x");
		that.g.yAxis.attr("class", "axis axis--y");

		// initialize g.legend
		that.g.legend.attr("transform", "translate(" + 20 + "," + 20 + ")");
		that.g.legend.append("rect")
			.attr("fill", "lightgray")
			.attr("opacity", 0.5);

		// initialize g.chart
		var m = that.margin;
		that.g.chart.attr("transform", "translate(" + m.left + "," + m.top + ")");

		// Resize once (initialize)
		that.onResize();

		that.updateLegend();

		that.on("resize", function(){
			that.onResize();
		});
	}

	MineChart.prototype.onResize = function(){
		var that = this;

		// Update size
		var m = that.margin;
		var width = that.g.chart.width = that.width - m.left - m.right;
		var height = that.g.chart.height = that.height - m.top - m.bottom;

		// Update range
		that.xScale.range([0, width]);
		that.yScale.range([height, 0]);

		// Update axis
		that.xAxis.ticks(width < 700 ? 4 : width < 1000 ? 6 : 8);
		that.g.xAxis
			.attr("transform", "translate(" + m.left + "," + (that.g.chart.height + m.top) + ")")
			.call(that.xAxis);
		that.g.yAxis
			.attr("transform", "translate(" + (m.left + width) + "," + m.top + ")")
			.call(that.yAxis);

		// Update lines
		Object.values(that.data).forEach(function(d){
			if(d.dom) d.dom.attr("d", that.line);
		});
	}

	window.MineChart = MineChart;
}());