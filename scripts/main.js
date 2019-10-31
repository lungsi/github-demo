//
//  main.js
//  Ten Brighter Ideas?  An Interactive Analysis
//
//  Created by Bret Victor on 3/31/10.
//


//----------------------------------------------------------
//
// main

var tangle = new Tangle();
var worksheetScripts = new Hash;
var analyses = new Hash;

window.addEvent('domready', function() {

	var initFunctions = [ initializeBrochure, initializeConstants ];
	worksheetScripts.getKeys().each( function (name) {
		initFunctions.push( function () { analyses[name] = new Analysis(name); });
	});
	
	fireNextInitFunction.delay(20);
	
	function fireNextInitFunction () {
		if (initFunctions.length == 0) { return; }
		var f = initFunctions.shift();
		f();
		fireNextInitFunction.delay(20);
	}

});



//----------------------------------------------------------
//
// brochure

function initializeBrochure() {

	var brochure = $("brochure");
	var arrow = (new Element("img", { src:"Images/BrochureArrow1.png", 
	                                  style:"position:absolute; display:none;" })).inject(brochure, "top");

	var activeClaim = null;
	var activeAnalysis = $("initialAnalysis");

	$$(".brochureClaim").each( function (claim) {
		var name = claim.get("id").split("_", 1)[0];

		claim.addEvent("mouseenter", function (event) {
			if (activeClaim == claim) { return; }
		
			var analysis = $(name + "_analysis");
			if (!analysis) { analysis = $("defaultAnalysis"); }
			
			if (activeAnalysis) { activeAnalysis.setStyle("display", "none"); }
			if (activeClaim)    { activeClaim.removeClass("brochureClaimActive"); }

			activeAnalysis = analysis;
			activeClaim = claim;			
			
			if (analysis) { analysis.setStyle("display", "block"); }
			if (claim) {
				claim.addClass("brochureClaimActive");
				
				var lineCount = (claim.getSize().y / 20).round().limit(1,3);
				arrow.setProperty("src", "Images/BrochureArrow" + lineCount + ".png");
				
				var yOffset = -6 + (Browser.Engine.gecko ? 1 : 0);
				arrow.setStyle("margin-top", claim.getPosition(brochure).y + yOffset);

				arrow.setStyle("margin-left", 14);
				arrow.setStyle("display", "block");
			}
		});
	});
}



//----------------------------------------------------------
//
// constants

function initializeConstants() {
	var sourceHTML;
	
	// read the "constants" data at the end of the document, and generate the constants hash

	$("constants").getChildren().each( function (div) {
	
		// get source
		if (div.hasClass("source")) { sourceHTML = div.get("html"); return; }

		// get value
		var id = div.get("id");
		var text = div.get("text");
		var value = text.toFloat();
		
		// parse table, if it's a table
		
		if (id.indexOf("table_") == 0) {
			value = new Array();
			if (text.indexOf(";") < 0) {
				// one-dimensional table
				text.split(",").each(function (column) {
					value.push(column.toFloat());
				});
			}
			else {
				// two-dimensional table
				text.split(";").each(function (row) {
					var rowValues = new Array();
					row.split(",").each(function (column) {
						rowValues.push(column.toFloat());
					});
					value.push(rowValues);
				});
			}
		}
		
		var name = id.substr(id.indexOf("_") + 1);
		tangle.addConstant(name, value, sourceHTML);
	});
}



//----------------------------------------------------------
//
// analysis

function Analysis(analysisName) {

	var analysis = this;
	var analysisEl = $(analysisName + '_analysis');
	
	var worksheet = tangle.addWorksheet(analysisName, analysisEl, worksheetScripts[analysisName]);

	initializeEditor();
	initializeSidebar();
	
	return this;
	
	
	//----------------------------------------------------------
	//
	// editor

	function initializeEditor() {

		var button = analysisEl.getElement(".analysisEditButton");
		var section = button.getParent(".analysisSection");
		var editContainer = analysisEl.getElement(".editorContainer");
		var controlsContainer = analysisEl.getElement(".editorControlsContainer");
		
		var editor = null;
		var controls = null;
		var isEditorShowing = false;
		
		var unrevertScript = null;
		var timeOfLastRun = (new Date).getTime();
		
		
		// editor

		function setEditorShowing(showing) {
			if (showing == isEditorShowing) { return; }
			isEditorShowing = showing;
			
			if (isEditorShowing) {
				addEditor();
				addControls();
				section.setStyle("display", "none");
				controlsContainer.setStyle("display", "inline");
				editContainer.setStyle("display", "block");
			}
			else {
				editContainer.setStyle("display", "none");
				controlsContainer.setStyle("display", "none");
				section.setStyle("display", "block");
			}
		}
		
		
		function editorChanged() {
			// ignore changes for a few seconds, since they are usually changes that happened
			// before the run, but we're not being notified until later.
			var now = (new Date).getTime();
			if (now - timeOfLastRun < 3000) { return; }
		
			if (unrevertScript) {
				unrevertScript = null;
				updateRevertButton();
			}
			if (isErrorShowing) {
				hideErrorMessage();
			}
		}


		// buttons
		
		button.addEvent("click", function (event) { event.stop(); editButtonWasClicked(); });

		function editButtonWasClicked() {
			analyses.each( function (analysis) { analysis.hideSidebar(); });
			setEditorShowing(true);
		}
		
		function hideButtonWasClicked() {
			setEditorShowing(false);
		}

		function runButtonWasClicked() {
			timeOfLastRun = (new Date).getTime();
			var worksheet = tangle.getWorksheet(analysisName);
			var script = editor.getCode();
			var error = worksheet.setScript(script);
			updateErrorMessage(error);
		}

		function revertButtonWasClicked() {
			timeOfLastRun = (new Date).getTime();
			if (unrevertScript) {
				editor.setCode(unrevertScript);
				unrevertScript = null;
			}
			else {
				unrevertScript = editor.getCode();
				editor.setCode(worksheetScripts[analysisName]);
			}
			updateRevertButton();
			runButtonWasClicked();
		}
		

		// error message

		var errorMessage = null;
		var isErrorShowing = false;

		function hideErrorMessage(error) {
			isErrorShowing = false;
			errorMessage.set("text", "");
		}
		
		function updateErrorMessage(error) {
			isErrorShowing = true;
			errorMessage.set("class", error ? "editorErrorMessage" : "editorSuccessMessage");
			
			if (!error) {
				errorMessage.set("text", "Updated.");
			}
			else {
				var filename = error.sourceURL ? error.sourceURL.split("/").getLast() : undefined;
				var lineNumber = error.line || error.lineNumber;
				var message = error.message || error.toString();
				
				var msg = "error" + 
				          (filename ? (", " + filename) : "") +
				          (lineNumber ? (", line " + lineNumber) : "") + 
				          ": " + message;
				errorMessage.set("text", msg);
				
				// select offending line
				if (lineNumber && !filename) {
					var lineHandle = editor.nthLine(lineNumber);
					if (lineHandle !== false) {
						var lineLength = editor.lineContent(lineHandle).length;
						editor.selectLines(lineHandle, 0, lineHandle, lineLength);
					}
				}
			}
		}

		// adding elements

		function addEditor() {
			if (editor) { return; }
			editor = new CodeMirror(editContainer, {
				width: "860px",
			    height: "3000px",
			    content: worksheetScripts[analysisName],
			    parserfile: ["tokenizejavascript.js", "parsejavascript.js"],
			    stylesheet: "Script/CodeMirror/jscolors.css",
			    path: "Script/CodeMirror/",
			    autoMatchParens: true,
			    indentUnit: 4,
			    onChange: editorChanged,
			});
		}

		var revertControl = null;

		function addControls() {
			if (controls) { return; }
			controls = controlsContainer;

			var runControl = (new Element("span", { "class":"editorControl", "text":"run" })).inject(controlsContainer);
			runControl.addEvent("click", function (event) { event.stop(); runButtonWasClicked() });
			
			revertControl = (new Element("span", { "class":"editorControl", "text":"revert" })).inject(controlsContainer);
			revertControl.addEvent("click", function (event) { event.stop(); revertButtonWasClicked() });
			
			var hideControl = (new Element("span", { "class":"editorControl", "text":"hide" })).inject(controlsContainer);
			hideControl.addEvent("click", function (event) { event.stop(); hideButtonWasClicked() });

			errorMessage = (new Element("span", { "class":"editorErrorMessage" })).inject(controlsContainer);
		}
		
		function updateRevertButton() {
			revertControl.set("text", unrevertScript ? "unrevert" : "revert");
		}
		
	}


	//----------------------------------------------------------
	//
	// sidebar

	function initializeSidebar() {

		var sidebarsDiv = analysisEl.getElement(".sidebars");
		var finalHeader = analysisEl.getElement(".analysisFinalHeader");
	
		var container = sidebarsDiv.getParent();
		var constantSidebar = (new Element("div", { "class":"sidebar" })).inject(sidebarsDiv);
		
		var activeSidebar = null;
		var highlightedElement = null;

		var activeSubSidebar = null;
		var subHighlightedElement = null;
		
		// initialize constants (class="k_constantName")
		
		tangle.getConstants().each( function (value, name) {
			var sourceHTML = tangle.getConstantDescription(name);
			if (!sourceHTML) { return; }
			
			var prefix = (value.length === undefined) ? "k_" : "table_";
			container.getElements("." + prefix + name).each( function (span) {
			
				if (!span.getParent(".sidebar")) { return; }  // only link constants in sidebars

				span.addEvent("mouseenter", function (event) {
					var sourceHeader = '<span class="constantSource">Source: </span>';
					if (!span.hasClass("x_null")) { sourceHeader += '(' + span.get("html") + ') '; }
					constantSidebar.set("html", sourceHeader + sourceHTML);
					showSidebarForElement(constantSidebar, span);
				});
				
				span.setHighlightedForSidebar = function (isHighlighted) {
					if (isHighlighted) { span.addClass("constantHighlighted"); }
					else { span.removeClass("constantHighlighted"); }
				}
			});
		});
		
		// initialize elements that show a named sidebar on hover (class="s_sidebarName")
		
		sidebarsDiv.getChildren(".sidebar").each( function (sidebar) {
			var prefix = "sidebar_";
			var sidebarId = sidebar.get("id");
			if (!sidebarId || sidebarId.indexOf(prefix) < 0) { return; }

			var sidebarName = sidebarId.substr(sidebarId.indexOf(prefix) + prefix.length);
			container.getElements(".s_" + sidebarName).each( function (el) {
				
				el.addEvent("mouseenter", function (event) {
					showSidebarForElement(sidebar, el);
				});

			});
		});
		
		// show sidebar on mouseenter
		
		function showSidebarForElement(sidebar, el) {
			var parentSidebar = el.getParent(".sidebar");
			if (parentSidebar) {
				// set sub sidebar
				
				if (activeSubSidebar) { activeSubSidebar.setStyle("display", "none"); }
				if (subHighlightedElement && subHighlightedElement.setHighlightedForSidebar) { 
					subHighlightedElement.setHighlightedForSidebar(false);
				}

				activeSubSidebar = sidebar;
				sidebar.setStyle("top", parentSidebar.getPosition(analysisEl).y + parentSidebar.getSize().y);

				subHighlightedElement = el;
				if (el.setHighlightedForSidebar) { el.setHighlightedForSidebar(true); }

    			sidebar.setStyle("display", "block");
			}
			else {
				// set main sidebar
				
				if (activeSidebar) { activeSidebar.setStyle("display", "none"); }
				if (activeSubSidebar) { activeSubSidebar.setStyle("display", "none"); activeSubSidebar = null; }
				if (highlightedElement && highlightedElement.setHighlightedForSidebar) { 
					highlightedElement.setHighlightedForSidebar(false);
				}
				if (subHighlightedElement && subHighlightedElement.setHighlightedForSidebar) {
					subHighlightedElement.setHighlightedForSidebar(false); subHighlightedElement = null;
				}

				activeSidebar = sidebar;

				var topY = el.getPosition(analysisEl).y;
				sidebar.setStyle("top", topY);
    			sidebar.setStyle("display", "block");
				
				var bottomMargin = 20;

				var heightPastFinalHeader = sidebar.getPosition().y + sidebar.getSize().y - finalHeader.getPosition().y + bottomMargin;
    			if (heightPastFinalHeader > 0) {
    				topY = Math.max(0, topY - heightPastFinalHeader);
					sidebar.setStyle("top", topY);
	    		}
				
				var heightPastWindowBottom = sidebar.getPosition().y + sidebar.getSize().y - 
				                             window.getScroll().y - window.getSize().y + bottomMargin;
    			if (heightPastWindowBottom > 0) {
    				topY = Math.max(0, topY - heightPastWindowBottom);
					sidebar.setStyle("top", topY);
    			}
    				
				highlightedElement = el;
				if (el.setHighlightedForSidebar) { el.setHighlightedForSidebar(true); }

			}
		}
		
		analysis.hideSidebar = function () {
			if (activeSidebar) { activeSidebar.setStyle("display", "none"); activeSidebar = null; }
			if (activeSubSidebar) { activeSubSidebar.setStyle("display", "none"); activeSubSidebar = null; }
			if (highlightedElement && highlightedElement.setHighlightedForSidebar) { 
				highlightedElement.setHighlightedForSidebar(false); highlightedElement = null;
			}
			if (subHighlightedElement && subHighlightedElement.setHighlightedForSidebar) {
				subHighlightedElement.setHighlightedForSidebar(false); subHighlightedElement = null;
			}
		};
	}
}


