import {VComponent} from "./VisualComponent";
import {min, max, sortBy, zipWith} from "lodash";
import * as d3 from "d3";
import {removeOverlaps, Rectangle} from "webcola";
import {SimpleEventHandler} from "../etc/SimpleEventHandler";
import {SVGMeasurements} from "../etc/SVGplus";
import {D3Sel, LooseObject} from "../etc/LocalTypes";


type wordObj = {
    word: string;
    score: number;
    pos: number[];
    compare: {
        attn: number[][];
        attn_padding: number[][];
        dist: number;
        orig: string;
        sentence: string
    }
}

export type WordProjectorClickedEvent = {
    caller: WordProjector,
    word: string,
    sentence: string,
    [key: string]: any
}

export class WordProjector extends VComponent<any> {

    css_name = 'wordprojector';

    static events = {
        wordClicked: "WordProjector_word_clicked"
    }

    options = {
        pos: {x: 0, y: 0},
        height: 400,
        width: 500,
        css_class_main: 'wp_vis',
        hidden: false,
        data_access: {
            pos: d => d.pos,
            scores: d => d.score,
            words: d => d.word,
            compare: d => d.compare
        },
        text_measurer: null,
        loc: null
    };


    layout = [
        {name: 'bg', pos: [0, 0]},
        {name: 'main', pos: [0, 0]},
    ];

    //-- default constructor --
    constructor(d3Parent: D3Sel, eventHandler?: SimpleEventHandler, options: {} = {}) {
        super(d3Parent, eventHandler);
        this.superInit(options);
    }

    _init() {
        const op = this.options;
        this.options.text_measurer = this.options.text_measurer
            || new SVGMeasurements(this.parent, 'measureWord');

        this.parent.attrs({
            width: op.width,
            height: op.height
        });
        if (this.options.hidden) this.hideView();
    }

    _wrangle(data) {

        const op = this.options;

        const raw_pos = op.data_access.pos(data);
        const x_values = <number[]>raw_pos.map(d => d[0]);
        const y_values = <number[]>raw_pos.map(d => d[1]);

        const p0_min = min(x_values);
        const p1_min = min(y_values);

        const diff0 = max(x_values) - p0_min;
        const diff1 = max(y_values) - p1_min;


        let norm_pos = [];

        if (diff0 > diff1) {
            norm_pos = raw_pos.map(d => [(d[0] - p0_min) / diff0, (d[1] - p1_min) / diff0]);
        } else {
            norm_pos = raw_pos.map(d => [(d[0] - p0_min) / diff1, (d[1] - p1_min) / diff1])
        }

        const words = op.data_access.words(data);
        const scores = op.data_access.scores(data);
        const compare = op.data_access.compare(data);
        this._current.has_compare = compare !== null;

        this._current.clearHighlights = true;

        return sortBy(zipWith(words, scores, norm_pos, compare,
            (word, score, pos, compare) => ({word, score, pos, compare})),
            (d: { word, score, pos, compare }) => -d.score);
    }

    _render(renderData: wordObj[]) {

        // console.log(renderData, "--- renderData");
        const op = this.options;

        const word = this.layers.main.selectAll<SVGGElement,any>(".word").data(renderData);
        word.exit().remove();

        const wordEnter = word.enter().append('g').attr('class', 'word');
        wordEnter.append('rect');
        wordEnter.append('text');

        const xscale = d3.scaleLinear().range([30, op.width - 30]);
        const yscale = d3.scaleLinear().range([10, op.height - 10]);
        const scoreExtent = d3.extent(renderData.map(d => d.score));
        const wordScale = d3.scaleLinear().domain(scoreExtent).range([10, 12]);

        // use webcola to remove rectangle overlap.
        const newPos = this.removeOverlap(renderData, wordScale, xscale, yscale, op.text_measurer);

        const allWords = wordEnter.merge(word);
        allWords.attr('transform',
            d => `translate(${newPos[d.word].cx}, ${newPos[d.word].cy})`);
        allWords.on('click', d => this.clickWord(d));
        allWords.classed('query', (d, i) => i == 0)


        allWords.select('rect').attrs({
            width: (d, i) => newPos[d.word].w,
            height: (d, i) => newPos[d.word].h - 2,
            x: (d, i) => -newPos[d.word].w * .5,
            y: (d, i) => -newPos[d.word].h * .5 + 1,
        });
        allWords.select('text')
            .text(d => d.word)
            .style('font-size', d => wordScale(d.score) + 'pt');

        // if (this._current.has_compare) {
        //     const bd_max = max(<number[]>renderData.map(d => d.compare.dist));
        //     const bd_scale = d3.scaleLinear<string, string>().domain([0, bd_max])
        //         .range(['#ffffff', '#63676e']); //TODO: hard-coded range ??
        //     allWords.select('rect').style('fill', d => {
        //         return bd_scale(d.compare.dist)
        //     })
        //
        // }


        if (this._current.clearHighlights) {
            this.highlightWord(null, false);
            this._current.clearHighlights = false;
        }


    }

    private removeOverlap(renderData: wordObj[], wordScale, xscale, yscale, text_measurer: SVGMeasurements) {
        const ofree = [];

        for (const rd of renderData) {
            const w = rd.word;
            const height = wordScale(rd.score);
            const x = xscale(rd.pos[0]);
            const y = yscale(rd.pos[1]);

            const width = text_measurer.textLength(w, 'font-size:' + height + 'pt;');

            ofree.push(new Rectangle(x - width / 2 - 4, x + width / 2 + 4,
                y - height / 2 - 3, y + height / 2 + 3))

        }


        removeOverlaps(ofree);

        const newPos = {};
        ofree.forEach((d, i) => {
            newPos[renderData[i].word] = {
                cx: (d.X + d.x) * .5,
                cy: (d.Y + d.y) * .5,
                w: (d.X - d.x),
                h: (d.Y - d.y)
            }
        });
        return newPos;
    }

    highlightWord(word: string, highlight: boolean, exclusive = true, label = 'selected'): void {

        const allWords = this.layers.main.selectAll(".word");

        if (!highlight && exclusive) {
            allWords.classed(label, false);
        } else {
            allWords
                .classed(label, function (d: wordObj) {
                    if ((d.word === word)) {
                        return highlight;
                    } else {
                        if (exclusive) return false;
                        else return d3.select(this).classed(label)
                    }
                })
        }


    }


    private clickWord(d: wordObj) {
        this.eventHandler.trigger(WordProjector.events.wordClicked, {
            caller: this,
            wordObj: d,
            sentence: d.compare.orig,
            word: d.word
        })


    }


}
